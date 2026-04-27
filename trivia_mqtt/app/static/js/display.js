const gameNameEl = document.getElementById("display-game-name");
const eventNameEl = document.getElementById("display-event-name");
const statusEl = document.getElementById("display-status");
const statusPillEl = document.getElementById("display-status-pill");
const questionProgressPillEl = document.getElementById("display-question-progress-pill");
const waitingStageEl = document.getElementById("waiting-stage");
const waitingMessageEl = document.getElementById("waiting-message");
const gameStageEl = document.getElementById("game-stage");
const finalStageEl = document.getElementById("final-stage");
const questionIndexEl = document.getElementById("display-question-index");
const questionMetaEl = document.getElementById("display-question-meta");
const questionTextEl = document.getElementById("display-question-text");
const optionsEl = document.getElementById("display-options");
const timerCardEl = document.getElementById("timer-card");
const timerEl = document.getElementById("display-timer");
const timerProgressEl = document.getElementById("display-timer-progress");
const timerCaptionEl = document.getElementById("display-timer-caption");
const currentTeamEl = document.getElementById("display-current-team");
const rankingEl = document.getElementById("display-ranking");
const responseTimesEl = document.getElementById("display-response-times");
const winnerEl = document.getElementById("display-winner");
const finalRankingEl = document.getElementById("display-final-ranking");
const popupEl = document.getElementById("display-popup");
const popupContentEl = document.getElementById("display-popup-content");
const soundToggleBtnEl = document.getElementById("sound-toggle-btn");

const displayShellEl = document.querySelector(".display-shell");
const questionCardEl = document.querySelector(".question-show-card");

const SOUND_STORAGE_KEY = "trivia_mqtt_sound_enabled";
const VIEW_STORAGE_KEY = "display_view";
const SOUND_FILES = {
  question_start: "/static/assets/sounds/question_start.mp3",
  button_press: "/static/assets/sounds/button_press.mp3",
  correct: "/static/assets/sounds/correct.mp3",
  incorrect: "/static/assets/sounds/incorrect.mp3",
  timeout: "/static/assets/sounds/timeout.mp3",
  game_end: "/static/assets/sounds/game_end.mp3",
};

let gameState = null;
let popupTimeout = null;
let lastPopupQuestionId = null;
let lastQuestionId = null;
let lastCurrentTeamId = null;
let lastScoresSnapshot = "";
let lastProcessedEventToken = "";
let lastOptionsSignature = "";
let lastPressQueueSignature = "";
let lastStatusForSound = "";
let soundEnabled = false;

const audioCache = {};

function publicStatus(status) {
  if (status === "setup") return "Esperando inicio de partida";
  if (status === "configured") return "Partida lista para iniciar";
  if (status === "game_running") return "Esperando pulsacion";
  if (status === "question_ready") return "Pregunta preparada";
  if (status === "question_active") return "Pregunta activa";
  if (status === "waiting_for_answer") return "Esperando validacion";
  if (status === "question_finished") return "Pregunta finalizada";
  if (status === "game_paused") return "Partida en pausa";
  if (status === "game_finished") return "Partida finalizada";
  return "Esperando inicio de partida";
}

function statusTone(status) {
  if (status === "question_active" || status === "waiting_for_answer") return "active";
  if (status === "question_ready" || status === "game_running") return "waiting";
  if (status === "game_paused") return "warning";
  if (status === "game_finished") return "finished";
  if (status === "question_finished") return "success";
  return "waiting";
}

function updateSoundUI() {
  const label = soundEnabled ? "Sonido: ON" : "Sonido: OFF";
  soundToggleBtnEl.querySelector("span:last-child").textContent = label;
}

function tryPlaySound(name) {
  if (!soundEnabled) return;
  const src = SOUND_FILES[name];
  if (!src) return;

  if (!audioCache[name]) {
    audioCache[name] = new Audio(src);
    audioCache[name].preload = "auto";
  }

  const audio = audioCache[name];
  audio.currentTime = 0;
  audio.play().catch(() => {
    // ignore missing files or blocked autoplay
  });
}

function showPopup(message, type = "info", durationMs = 2600) {
  popupContentEl.textContent = message;
  popupContentEl.className = `display-popup-content ${type}`;
  popupEl.classList.remove("hidden");

  if (popupTimeout) {
    clearTimeout(popupTimeout);
  }

  popupTimeout = setTimeout(() => {
    popupEl.classList.add("hidden");
  }, durationMs);
}

function applyTheme() {
  const theme = gameState?.visual_config?.theme || "dark";
  displayShellEl.dataset.theme = theme;
}

function updateTitleBand() {
  const displayTitle = gameState?.visual_config?.display_title || gameState?.game_name || "TriviaMQTT";
  gameNameEl.textContent = displayTitle;
  eventNameEl.textContent = gameState?.game_name || "Evento en vivo";

  const status = gameState?.game_status || "setup";
  const text = publicStatus(status);
  statusEl.textContent = text;
  statusPillEl.textContent = text;
  statusPillEl.className = "status-pill";

  const tone = statusTone(status);
  if (tone === "active" || tone === "success") {
    statusPillEl.classList.add("status-pill-active");
  }
  if (tone === "warning") {
    statusPillEl.classList.add("warning");
  }
  if (tone === "finished") {
    statusPillEl.classList.add("error");
  }
}

function updateQuestionProgressPill() {
  const index = Number(gameState?.current_question_index ?? -1);
  const total = Number(gameState?.total_questions ?? 0);
  const questionNumber = index >= 0 ? index + 1 : "-";
  questionProgressPillEl.textContent = `Pregunta ${questionNumber} de ${total || "-"}`;
}

function toggleStages(status) {
  if (["setup", "configured"].includes(status)) {
    waitingStageEl.classList.remove("hidden");
    gameStageEl.classList.add("hidden");
    finalStageEl.classList.add("hidden");
    waitingMessageEl.textContent = "Esperando inicio de partida";
    return;
  }

  if (status === "game_finished") {
    waitingStageEl.classList.add("hidden");
    gameStageEl.classList.add("hidden");
    finalStageEl.classList.remove("hidden");
    return;
  }

  waitingStageEl.classList.add("hidden");
  gameStageEl.classList.remove("hidden");
  finalStageEl.classList.add("hidden");
}

function renderQuestionMeta(question) {
  questionMetaEl.innerHTML = "";
  if (!question) return;

  const chips = [];
  if (question.category) chips.push([question.category, false]);
  if (question.difficulty) chips.push([question.difficulty, true]);

  chips.forEach(([label, alt]) => {
    const chip = document.createElement("span");
    chip.className = `question-chip${alt ? " is-alt" : ""}`;
    chip.textContent = label;
    questionMetaEl.appendChild(chip);
  });
}

function renderOptions(question) {
  const signature = JSON.stringify({
    id: question?.question_id || null,
    a: question?.option_a || "",
    b: question?.option_b || "",
    c: question?.option_c || "",
    d: question?.option_d || "",
    revealed: Boolean(gameState?.answer_revealed),
    revealedAnswer: gameState?.revealed_correct_answer || null,
    status: gameState?.game_status || "setup",
  });
  if (signature === lastOptionsSignature) return;
  lastOptionsSignature = signature;

  optionsEl.innerHTML = "";
  if (!question) {
    optionsEl.innerHTML = '<div class="list-empty">Sin pregunta activa.</div>';
    return;
  }

  const options = [
    ["A", question.option_a],
    ["B", question.option_b],
    ["C", question.option_c],
    ["D", question.option_d],
  ];
  const answerRevealed = Boolean(gameState?.answer_revealed && gameState?.question_finished);
  const revealedAnswer = gameState?.revealed_correct_answer || null;

  options.forEach(([letter, text]) => {
    const option = document.createElement("article");
    option.className = `option-card option-${letter.toLowerCase()} fade-in`;

    if (answerRevealed) {
      if (revealedAnswer === letter) {
        option.classList.add("correct", "correct-flash");
      } else {
        option.classList.add("disabled");
      }
    }

    option.innerHTML = `
      <span class="option-letter">${letter}</span>
      <span class="option-text">${text || "-"}</span>
    `;
    optionsEl.appendChild(option);
  });
}

function renderRanking(scores) {
  if (!scores || scores.length === 0) {
    rankingEl.className = "list-empty";
    rankingEl.textContent = "Sin puntajes aun.";
    return;
  }

  const normalized = scores.map((team, index) => ({
    position: index + 1,
    team_name: team.team_name || team.name || "Equipo",
    score: Number(team.score || 0),
  }));

  const snapshot = JSON.stringify(normalized);
  const changed = snapshot !== lastScoresSnapshot;
  lastScoresSnapshot = snapshot;

  rankingEl.className = "ranking-list";
  rankingEl.innerHTML = normalized
    .map((team, index) => {
      const classes = ["ranking-item", index === 0 ? "ranking-leader" : "", changed ? "slide-up" : ""]
        .filter(Boolean)
        .join(" ");
      return `
        <div class="${classes}">
          <span class="ranking-position">${team.position}</span>
          <span class="ranking-team">${team.team_name}</span>
          <span class="ranking-score">${team.score} pts</span>
        </div>
      `;
    })
    .join("");
}

function renderResponseTimes(pressQueue) {
  const normalized = (pressQueue || []).map((press) => ({
    team_name: press.team_name || "Equipo",
    elapsed_time: Number(press.elapsed_time || 0),
  }));
  const signature = JSON.stringify(normalized);
  if (signature === lastPressQueueSignature) return;
  lastPressQueueSignature = signature;

  if (normalized.length === 0) {
    responseTimesEl.className = "queue-empty";
    responseTimesEl.innerHTML = `
      <span class="queue-empty-icon" aria-hidden="true">Q</span>
      <span>Sin pulsaciones registradas</span>
    `;
    return;
  }

  const sorted = [...normalized].sort((a, b) => a.elapsed_time - b.elapsed_time);
  responseTimesEl.className = "queue-list";
  responseTimesEl.innerHTML = sorted
    .map(
      (press, index) => `
        <div class="queue-item">
          <span class="queue-order">${index + 1}.</span>
          <span class="queue-team">${press.team_name}</span>
          <span class="queue-time">${press.elapsed_time.toFixed(2)} s</span>
        </div>
      `
    )
    .join("");
}

function renderTimer() {
  const status = gameState?.game_status || "setup";
  const remaining = Math.max(0, Number(gameState?.question_remaining_time || 0));
  const total = Math.max(1, Number(gameState?.question_time || 20));
  const ratio = Math.max(0, Math.min(1, remaining / total));

  timerEl.textContent = `${remaining}s`;
  timerProgressEl.style.width = `${ratio * 100}%`;

  timerCardEl.classList.remove("timer-warning", "timer-danger", "timer-paused", "warning-pulse");

  if (status === "game_paused") {
    timerCardEl.classList.add("timer-paused");
    timerCaptionEl.textContent = "Tiempo pausado";
    return;
  }

  if (status === "question_finished") {
    timerCaptionEl.textContent = "Pregunta finalizada";
    return;
  }

  if (remaining <= 0 && ["question_active", "waiting_for_answer", "question_ready"].includes(status)) {
    timerCardEl.classList.add("timer-danger");
    timerCaptionEl.textContent = "Tiempo agotado";
    return;
  }

  if (remaining <= 5 && remaining > 0 && status === "question_active") {
    timerCardEl.classList.add("timer-warning", "warning-pulse");
    timerCaptionEl.textContent = "Ultimos segundos";
    return;
  }

  timerCaptionEl.textContent = "Tiempo en curso";
}

function renderCurrentTeam() {
  const team = gameState?.current_team || null;
  const status = gameState?.game_status || "setup";
  const canRespond = ["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished"].includes(status);
  currentTeamEl.classList.remove("current-team-active", "neon-pulse", "waiting-team");

  if (!team || !team.name) {
    currentTeamEl.textContent = "Responde: esperando pulsacion";
    if (canRespond) {
      statusEl.textContent = "Responde: esperando pulsacion";
    }
    currentTeamEl.classList.add("waiting-team");
    lastCurrentTeamId = null;
    return;
  }

  currentTeamEl.textContent = `Responde: ${team.name}`;
  if (canRespond) {
    statusEl.textContent = `Responde: ${team.name}`;
  }
  currentTeamEl.classList.add("current-team-active");

  if (team.team_id !== lastCurrentTeamId) {
    currentTeamEl.classList.remove("neon-pulse");
    void currentTeamEl.offsetWidth;
    currentTeamEl.classList.add("neon-pulse");
    lastCurrentTeamId = team.team_id;
  }
}

function renderFinalScreen(scores) {
  if (!scores || scores.length === 0) {
    winnerEl.textContent = "Equipo ganador: -";
    finalRankingEl.innerHTML = "";
    return;
  }

  const normalized = scores.map((team, index) => ({
    position: index + 1,
    team_name: team.team_name || team.name || "Equipo",
    score: Number(team.score || 0),
  }));
  const winner = normalized[0];

  winnerEl.textContent = `Equipo ganador: ${winner.team_name}`;
  finalRankingEl.innerHTML = normalized
    .map(
      (team, index) => `
        <div class="final-ranking-item ${index === 0 ? "winner" : ""}">
          <span class="ranking-position">${team.position}</span>
          <span class="ranking-team">${team.team_name}</span>
          <span class="ranking-score">${team.score} pts</span>
        </div>
      `
    )
    .join("");
}

function maybePlayStateSounds(status) {
  const currentQuestionId = gameState?.current_question?.question_id || null;

  if (status === "question_active" && currentQuestionId && currentQuestionId !== lastQuestionId) {
    tryPlaySound("question_start");
    lastQuestionId = currentQuestionId;
  }

  if (status === "game_finished" && lastStatusForSound !== "game_finished") {
    tryPlaySound("game_end");
  }
  lastStatusForSound = status;
}

function maybeShowStatePopup() {
  const status = gameState?.game_status;
  if (!gameState || !gameState.current_question) return;
  if (!gameState.answer_revealed || !gameState.question_finished) return;

  const questionId = gameState.current_question.question_id;
  if (!questionId || lastPopupQuestionId === questionId) return;

  const answer = gameState.revealed_correct_answer || gameState.current_question.correct_answer;
  if (gameState.current_team) {
    showPopup(`Respuesta correcta: ${gameState.current_team.name} (${answer})`, "success", 3200);
    questionCardEl.classList.remove("incorrect-flash");
    questionCardEl.classList.add("correct-flash");
  } else if (status === "question_finished") {
    showPopup(`Respuesta revelada: ${answer}`, "warning", 3000);
    questionCardEl.classList.remove("correct-flash");
    questionCardEl.classList.add("incorrect-flash");
  }

  lastPopupQuestionId = questionId;
}

function renderState() {
  if (!gameState) return;

  applyTheme();
  updateTitleBand();
  updateQuestionProgressPill();

  const status = gameState.game_status || "setup";
  displayShellEl.dataset.state = status;
  toggleStages(status);
  maybePlayStateSounds(status);

  const index = Number(gameState.current_question_index ?? -1);
  const total = Number(gameState.total_questions ?? 0);
  questionIndexEl.textContent = `Pregunta ${index >= 0 ? index + 1 : "-"}/${total || "-"}`;
  questionTextEl.textContent = gameState.current_question?.text || "Esperando pregunta...";

  renderQuestionMeta(gameState.current_question || null);
  renderOptions(gameState.current_question || null);
  renderTimer();
  renderCurrentTeam();
  renderRanking(gameState.scores || []);
  renderResponseTimes(gameState.press_queue || []);
  renderFinalScreen(gameState.scores || []);
  maybeShowStatePopup();

  if (status === "game_paused") {
    showPopup(`Partida pausada: ${gameState.game_pause_reason || "Pausa manual"}`, "warning", 2400);
  }
}

function processEventEffects(eventData) {
  if (!eventData) return;
  const token = `${eventData.event_type}:${eventData.timestamp || ""}`;
  if (token === lastProcessedEventToken) return;
  lastProcessedEventToken = token;

  if (eventData.event_type === "button_pressed") {
    const teamName = eventData.team_name || eventData.payload?.team_name || "Equipo";
    showPopup(`Responde: ${teamName}`, "info", 1800);
    tryPlaySound("button_press");
    return;
  }

  if (eventData.event_type === "answer_correct") {
    const teamName = eventData.team_name || "Equipo";
    showPopup(`Respuesta correcta: ${teamName}`, "success", 2600);
    tryPlaySound("correct");
    return;
  }

  if (eventData.event_type === "answer_incorrect_next_team" || eventData.event_type === "answer_incorrect_no_more_teams") {
    showPopup("Respuesta incorrecta", "error", 2400);
    tryPlaySound("incorrect");
    return;
  }

  if (eventData.event_type === "question_timeout_no_answers") {
    showPopup("Tiempo agotado", "warning", 2400);
    tryPlaySound("timeout");
  }
}

async function loadInitialState() {
  const response = await fetch("/api/game/state");
  gameState = await response.json();
  renderState();
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "game_state_updated") {
      gameState = message.data || {};
      renderState();
      return;
    }

    if (message.type === "event_received") {
      processEventEffects(message.data || null);
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 1000);
  };
}

function initializeSoundToggle() {
  soundEnabled = window.localStorage.getItem(SOUND_STORAGE_KEY) === "1";
  updateSoundUI();

  soundToggleBtnEl.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    window.localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "1" : "0");
    updateSoundUI();
    if (soundEnabled) {
      showPopup("Sonido activado", "success", 1200);
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key !== VIEW_STORAGE_KEY || !event.newValue) return;
  try {
    const payload = JSON.parse(event.newValue);
    if (payload.view === "results") {
      window.location.href = "/results";
    } else if (payload.view === "display") {
      window.location.href = "/display";
    }
  } catch (_) {
    // ignore malformed payload
  }
});

initializeSoundToggle();
loadInitialState().catch((error) => {
  console.error("Error loading display state", error);
});
connectWebSocket();
