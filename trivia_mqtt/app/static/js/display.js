const gameNameEl = document.getElementById("display-game-name");
const eventNameEl = document.getElementById("display-event-name");
const statusEl = document.getElementById("display-status");
const waitingStageEl = document.getElementById("waiting-stage");
const waitingMessageEl = document.getElementById("waiting-message");
const gameStageEl = document.getElementById("game-stage");
const finalStageEl = document.getElementById("final-stage");
const questionIndexEl = document.getElementById("display-question-index");
const questionTextEl = document.getElementById("display-question-text");
const optionsEl = document.getElementById("display-options");
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
const soundStatusEl = document.getElementById("sound-status");

const displayShellEl = document.querySelector(".display-shell");
const questionPanelEl = document.querySelector(".question-panel");

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
let soundEnabled = false;

const audioCache = {};

function stateMessage(status) {
  if (status === "setup") return "Esperando configuracion";
  if (status === "configured") return "Partida lista";
  if (status === "game_running") return "Esperando pulsacion";
  if (status === "question_ready") return "Pregunta en juego";
  if (status === "question_active") return "Pregunta activa";
  if (status === "waiting_for_answer") return "Equipo en turno";
  if (status === "game_paused") return "Temporizador pausado";
  if (status === "question_finished") return "Pregunta finalizada";
  if (status === "game_finished") return "Partida finalizada";
  return "Esperando inicio de partida";
}

function updateSoundUI() {
  soundStatusEl.textContent = soundEnabled ? "Sonido ON" : "Sonido OFF";
  const label = soundToggleBtnEl.querySelector("span");
  if (label) {
    label.textContent = soundEnabled ? "Sonido: ON" : "Activar sonido";
  }
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
    // ignore missing file or autoplay block
  });
}

function showPopup(message, type = "info", durationMs = 3000) {
  if (!popupEl || !popupContentEl) return;
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

function updateTitles() {
  const displayTitle = gameState?.visual_config?.display_title || gameState?.game_name || "TriviaMQTT";
  gameNameEl.textContent = displayTitle;
  eventNameEl.textContent = gameState?.game_name || "Evento en vivo";
}

function toggleStages(status) {
  const waitingStatuses = ["setup", "configured"];
  if (waitingStatuses.includes(status)) {
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

function renderOptions(question) {
  const signature = JSON.stringify({
    id: question?.question_id || null,
    a: question?.option_a || "",
    b: question?.option_b || "",
    c: question?.option_c || "",
    d: question?.option_d || "",
    revealed: Boolean(gameState?.answer_revealed),
    revealedAnswer: gameState?.revealed_correct_answer || null,
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

  const revealedAnswer = gameState?.revealed_correct_answer || null;
  const answerRevealed = Boolean(gameState?.answer_revealed);

  options.forEach(([letter, text]) => {
    const option = document.createElement("article");
    option.className = "option-item fade-in";
    if (answerRevealed && revealedAnswer === letter) {
      option.classList.add("option-correct", "correct-flash");
    }
    option.innerHTML = `<strong>${letter}</strong><span>${text || "-"}</span>`;
    optionsEl.appendChild(option);
  });
}

function renderRanking(scores) {
  if (!scores || scores.length === 0) {
    rankingEl.className = "list-empty";
    rankingEl.textContent = "Sin puntajes aun.";
    return;
  }

  const snapshot = JSON.stringify(scores.map((team) => ({ id: team.team_id, score: team.score })));
  const animate = snapshot !== lastScoresSnapshot;
  lastScoresSnapshot = snapshot;

  rankingEl.className = "ranking-list";
  rankingEl.innerHTML = scores
    .map((team, index) => {
      const rowClass = ["ranking-row", index === 0 ? "leader" : "", animate ? "score-updated" : ""]
        .filter(Boolean)
        .join(" ");
      return `<div class="${rowClass}"><span>${index + 1}. ${team.name}</span><span>${team.score} pts</span></div>`;
    })
    .join("");
}

function renderResponseTimes(pressQueue) {
  const signature = JSON.stringify(
    (pressQueue || []).map((press) => ({
      team_id: press.team_id,
      team_name: press.team_name,
      elapsed_time: Number(press.elapsed_time || 0),
    }))
  );
  if (signature === lastPressQueueSignature) return;
  lastPressQueueSignature = signature;

  if (!pressQueue || pressQueue.length === 0) {
    responseTimesEl.className = "list-empty";
    responseTimesEl.textContent = "Sin respuestas aun.";
    return;
  }

  const sortedPresses = [...pressQueue].sort((a, b) => Number(a.elapsed_time || 0) - Number(b.elapsed_time || 0));
  responseTimesEl.className = "response-times-list";
  responseTimesEl.innerHTML = sortedPresses
    .map((press, index) => `${index + 1}. ${press.team_name} - ${Number(press.elapsed_time || 0).toFixed(2)} s`)
    .join("<br />");
}

function renderTimer() {
  const remaining = Number(gameState?.question_remaining_time || 0);
  const total = Number(gameState?.question_time || 20);
  const safeTotal = total > 0 ? total : 20;
  const ratio = Math.max(0, Math.min(1, remaining / safeTotal));

  timerEl.textContent = `${remaining}s`;
  timerProgressEl.style.width = `${ratio * 100}%`;

  timerProgressEl.classList.remove("timer-warning");
  timerEl.classList.remove("timer-warning");
  if (remaining <= 5 && gameState?.game_status === "question_active") {
    timerProgressEl.classList.add("timer-warning");
    timerEl.classList.add("timer-warning");
    timerCaptionEl.textContent = "Ultimos segundos";
  } else if (remaining === 0 && ["question_active", "waiting_for_answer"].includes(gameState?.game_status)) {
    timerCaptionEl.textContent = "Tiempo agotado";
  } else {
    timerCaptionEl.textContent = "Tiempo en curso";
  }
}

function renderFinalScreen(scores) {
  if (!scores || scores.length === 0) {
    winnerEl.textContent = "Equipo ganador: -";
    finalRankingEl.innerHTML = "";
    return;
  }

  const winner = scores[0];
  winnerEl.textContent = `Equipo ganador: ${winner.name}`;
  finalRankingEl.innerHTML = scores
    .map((team, index) => {
      const winnerClass = index === 0 ? "winner-highlight" : "";
      return `<div class="final-ranking-row ${winnerClass}"><span>${index + 1}. ${team.name}</span><strong>${team.score} pts</strong></div>`;
    })
    .join("");
}

function renderCurrentTeam() {
  const teamName = gameState?.current_team?.name || "-";
  currentTeamEl.textContent = `Responde: ${teamName}`;

  const teamId = gameState?.current_team?.team_id || null;
  if (teamId && teamId !== lastCurrentTeamId) {
    currentTeamEl.classList.remove("team-active");
    void currentTeamEl.offsetWidth;
    currentTeamEl.classList.add("team-active");
    lastCurrentTeamId = teamId;
  }
}

function maybePlayStateSounds(status) {
  const currentQuestionId = gameState?.current_question?.question_id || null;

  if (status === "question_active" && currentQuestionId && currentQuestionId !== lastQuestionId) {
    tryPlaySound("question_start");
    lastQuestionId = currentQuestionId;
  }

  if (status === "game_finished") {
    tryPlaySound("game_end");
  }
}

function maybeShowStatePopup() {
  if (!gameState || !gameState.current_question) return;
  if (!gameState.answer_revealed || !gameState.question_finished) return;

  const questionId = gameState.current_question.question_id;
  if (!questionId || lastPopupQuestionId === questionId) return;

  const answer = gameState.revealed_correct_answer || gameState.current_question.correct_answer;
  if (gameState.current_team) {
    showPopup(`¡Respuesta correcta! ${gameState.current_team.name} (${answer})`, "success", 3500);
    questionPanelEl.classList.remove("incorrect-flash");
    questionPanelEl.classList.add("correct-flash");
  } else {
    showPopup(`Respuesta incorrecta. Correcta: ${answer}`, "warning", 3500);
    questionPanelEl.classList.remove("correct-flash");
    questionPanelEl.classList.add("incorrect-flash");
  }

  lastPopupQuestionId = questionId;
}

function renderState() {
  if (!gameState) return;

  applyTheme();
  updateTitles();

  const status = gameState.game_status || "setup";
  statusEl.textContent = stateMessage(status);
  toggleStages(status);

  maybePlayStateSounds(status);

  if (status === "game_paused") {
    showPopup(`Temporizador pausado: ${gameState.game_pause_reason || "Pausa manual"}`, "warning", 2800);
  }

  const index = Number(gameState.current_question_index ?? -1);
  const total = Number(gameState.total_questions ?? 0);
  questionIndexEl.textContent = `Pregunta ${index >= 0 ? index + 1 : "-"}/${total || "-"}`;
  questionTextEl.textContent = gameState.current_question?.text || "Esperando pregunta...";

  renderOptions(gameState.current_question);
  renderTimer();
  renderCurrentTeam();
  renderRanking(gameState.scores || []);
  renderResponseTimes(gameState.press_queue || []);
  renderFinalScreen(gameState.scores || []);

  maybeShowStatePopup();
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
    showPopup(`¡Respuesta correcta! ${teamName}`, "success", 2600);
    tryPlaySound("correct");
    return;
  }

  if (eventData.event_type === "answer_incorrect_next_team" || eventData.event_type === "answer_incorrect_no_more_teams") {
    showPopup("Respuesta incorrecta", "error", 2400);
    tryPlaySound("incorrect");
    return;
  }

  if (eventData.event_type === "question_timeout_no_answers") {
    showPopup("Tiempo agotado", "warning", 2500);
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
      return;
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
      showPopup("Sonido activado", "success", 1400);
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
