const gameNameEl = document.getElementById("display-game-name");
const questionProgressPillEl = document.getElementById("display-question-progress-pill");
const waitingStageEl = document.getElementById("waiting-stage");
const waitingMessageEl = document.getElementById("waiting-message");
const gameStageEl = document.getElementById("game-stage");
const finalStageEl = document.getElementById("final-stage");
const questionTextEl = document.getElementById("display-question-text");
const optionsEl = document.getElementById("display-options");
const timerCardEl = document.getElementById("timer-card");
const timerEl = document.getElementById("display-timer");
const timerProgressEl = document.getElementById("display-timer-progress");
const currentTeamEl = document.getElementById("display-current-team");
const rankingEl = document.getElementById("display-ranking");
const responseTimesEl = document.getElementById("display-response-times");
const winnerEl = document.getElementById("display-winner");
const finalRankingEl = document.getElementById("display-final-ranking");
const popupEl = document.getElementById("display-popup");
const popupContentEl = document.getElementById("display-popup-content");
const popupBackdropEl = document.getElementById("display-popup-backdrop");

const displayShellEl = document.querySelector(".display-shell");
const questionCardEl = document.querySelector(".question-show-card");

const VIEW_STORAGE_KEY = "display_view";

let gameState = null;
let popupTimeout = null;
let lastPopupQuestionId = null;
let lastQuestionId = null;
let lastCurrentTeamId = null;
let lastScoresSnapshot = "";
let lastProcessedEventToken = "";
let lastOptionsSignature = "";
let lastPressQueueSignature = "";

function formatTeamName(name) {
  if (!name) return "—";
  const raw = String(name).trim();
  if (!raw) return "—";
  if (/^\d+$/.test(raw)) return `Equipo ${raw}`;
  return raw
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(word => {
      const lowerWords = ["de", "del", "la", "las", "el", "los", "y", "e"];
      if (lowerWords.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function showPopup(message, type = "info", durationMs = 4600) {
  const status = gameState?.game_status;
  if (status === "game_finished" || status === "final") return;
  
  popupContentEl.textContent = message;
  popupContentEl.className = `display-popup-content ${type}`;
  popupEl.classList.remove("hidden");
  popupBackdropEl.classList.remove("hidden");
  if (popupTimeout) clearTimeout(popupTimeout);
  popupTimeout = setTimeout(() => {
    popupEl.classList.add("hidden");
    popupBackdropEl.classList.add("hidden");
  }, durationMs);
}

function applyTheme() {
  const theme = gameState?.visual_config?.theme || "dark";
  displayShellEl.dataset.theme = theme;
}

function updateTitleBand() {
  const displayTitle = gameState?.visual_config?.display_title || gameState?.game_name || "TriviaMQTT";
  gameNameEl.textContent = displayTitle;
}

function updateQuestionProgressPill() {
  const index = Number(gameState?.current_question_index ?? -1);
  const total = Number(gameState?.total_questions ?? 0);
  questionProgressPillEl.textContent = `Pregunta ${index >= 0 ? index + 1 : "-"} de ${total || "-"}`;
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
      if (revealedAnswer === letter) option.classList.add("correct", "correct-flash");
      else option.classList.add("disabled");
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
    rankingEl.textContent = "Sin puntajes aún.";
    return;
  }

  const normalized = scores.map((team, index) => ({
    position: index + 1,
    team_name: formatTeamName(team.team_name || team.name || "Equipo"),
    score: Number(team.score || 0),
    avg_time: Number(team.total_response_time || 0),
  }));

  const snapshot = JSON.stringify(normalized);
  const changed = snapshot !== lastScoresSnapshot;
  lastScoresSnapshot = snapshot;

  rankingEl.className = "ranking-list";
  rankingEl.innerHTML = normalized
    .map((team, index) => {
      const leaderClass = index === 0 ? "ranking-leader" : "";
      const animateClass = changed ? "slide-up" : "";
      const classes = ["ranking-item", leaderClass, animateClass].filter(Boolean).join(" ");
      const timeDisplay = team.avg_time > 0 ? `<span class="ranking-time">⏱️ ${team.avg_time}s</span>` : "";
      return `<div class="${classes}"><span class="ranking-position">${team.position}</span><span class="ranking-team">${team.team_name}</span><span class="ranking-score">${team.score} pts</span>${timeDisplay}</div>`;
    })
    .join("");
}

function renderResponseTimes(pressQueue) {
  const normalized = (pressQueue || []).map((press) => ({
    team_name: formatTeamName(press.team_name || "Equipo"),
    elapsed_time: Number(press.elapsed_time || 0),
  }));
  const signature = JSON.stringify(normalized);
  if (signature === lastPressQueueSignature) return;
  lastPressQueueSignature = signature;

  if (normalized.length === 0) {
    responseTimesEl.className = "queue-empty";
    responseTimesEl.innerHTML = `<span class="queue-empty-icon" aria-hidden="true">Q</span><span>Sin pulsaciones registradas</span>`;
    return;
  }

  const sorted = [...normalized].sort((a, b) => a.elapsed_time - b.elapsed_time);
  responseTimesEl.className = "queue-list";
  responseTimesEl.innerHTML = sorted
    .map((press, index) => `<div class="queue-item"><span class="queue-order">${index + 1}.</span><span class="queue-team">${press.team_name}</span><span class="queue-time">${press.elapsed_time.toFixed(2)} s</span></div>`)
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
    return;
  }

  if (status === "question_finished") {
    return;
  }

  if (remaining <= 0 && ["question_active", "waiting_for_answer", "question_ready"].includes(status)) {
    timerCardEl.classList.add("timer-danger");
    return;
  }

  if (remaining <= 5 && remaining > 0 && status === "question_active") {
    timerCardEl.classList.add("timer-warning", "warning-pulse");
    return;
  }
}

function renderCurrentTeam() {
  const team = gameState?.current_team || null;
  const status = gameState?.game_status || "setup";
  const canRespond = ["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished"].includes(status);
  currentTeamEl.classList.remove("current-team-active", "neon-pulse", "waiting-team");

  if (!team || !team.name) {
    currentTeamEl.innerHTML = "<span>Responde: </span>esperando pulsación";
    currentTeamEl.classList.add("waiting-team");
    lastCurrentTeamId = null;
    return;
  }

  currentTeamEl.innerHTML = `<span>Responde: </span>${formatTeamName(team.name)}`;
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
    team_name: formatTeamName(team.team_name || team.name || "Equipo"),
    score: Number(team.score || 0),
    avg_time: Number(team.total_response_time || 0),
  }));
  const winner = normalized[0];

  winnerEl.textContent = `Equipo ganador: ${winner.team_name}`;
  finalRankingEl.innerHTML = normalized
    .map((team, index) => {
      const timeDisplay = team.avg_time > 0 ? `<span class="ranking-time">⏱️ ${team.avg_time}s</span>` : "";
      return `<div class="final-ranking-item ${index === 0 ? "winner" : ""}"><span class="ranking-position">${team.position}</span><span class="ranking-team">${team.team_name}</span><span class="ranking-score">${team.score} pts</span>${timeDisplay}</div>`;
    })
    .join("");
}

function renderState() {
  if (!gameState) return;

  applyTheme();
  updateTitleBand();
  updateQuestionProgressPill();

  const status = gameState.game_status || "setup";
  displayShellEl.dataset.state = status;
  toggleStages(status);

  questionTextEl.textContent = gameState.current_question?.text || "Esperando pregunta...";

  const questionText = gameState.current_question?.text || "";
  questionTextEl.classList.remove("question-title-long", "question-title-extra-long");
  if (questionText.length > 140) questionTextEl.classList.add("question-title-extra-long");
  else if (questionText.length > 90) questionTextEl.classList.add("question-title-long");

  renderOptions(gameState.current_question || null);
  renderTimer();
  renderCurrentTeam();
  renderRanking(gameState.scores || []);
  renderResponseTimes(gameState.press_queue || []);
  renderFinalScreen(gameState.scores || []);
  maybeShowStatePopup();

  if (status === "game_paused") {
    showPopup(`⏸️ ${gameState.game_pause_reason || "Pausa manual"}`, "warning", 4400);
  }
}

function maybeShowStatePopup() {
  const status = gameState?.game_status;
  if (!gameState || !gameState.current_question) return;
  if (!gameState.answer_revealed || !gameState.question_finished) return;

  const questionId = gameState.current_question.question_id;
  if (!questionId || lastPopupQuestionId === questionId) return;

  const answer = gameState.revealed_correct_answer || gameState.current_question.correct_answer;
  if (gameState.current_team) {
    showPopup(`🎉 ¡${formatTeamName(gameState.current_team.name)} acertó! (${answer})`, "success", 5200);
    questionCardEl.classList.remove("incorrect-flash");
    questionCardEl.classList.add("correct-flash");
  } else if (status === "question_finished") {
    showPopup(`💡 La respuesta era: ${answer}`, "warning", 5000);
    questionCardEl.classList.remove("correct-flash");
    questionCardEl.classList.add("incorrect-flash");
  }
  lastPopupQuestionId = questionId;
}

function processEventEffects(eventData) {
  if (!eventData) return;
  const token = `${eventData.event_type}:${eventData.timestamp || ""}`;
  if (token === lastProcessedEventToken) return;
  lastProcessedEventToken = token;

  if (eventData.event_type === "button_pressed") {
    const teamName = formatTeamName(eventData.team_name || eventData.payload?.team_name || "Equipo");
    showPopup(`🕹️ ${teamName} presiona el botón!`, "info", 1500);
    return;
  }

  if (eventData.event_type === "answer_correct") {
    const teamName = formatTeamName(eventData.team_name || "Equipo");
    showPopup(`🏆 ¡${teamName} ha avanzado!`, "success", 4600);
    return;
  }

  if (eventData.event_type === "answer_incorrect_next_team" || eventData.event_type === "answer_incorrect_no_more_teams") {
    showPopup("❌ No es correcto... ¡siguiente!", "error", 4400);
    return;
  }

if (eventData.event_type === "question_timeout_no_answers") {
    showPopup("⏰ ¡Se acabou el tiempo!", "warning", 4400);
  }
  
  // Solo mostrar popup si el control está asignado a un equipo
  if (eventData.event_type === "control_offline") {
    const deviceId = eventData.device_id || eventData.payload?.device_id || "control";
    const teamName = eventData.team_name || eventData.team?.name || eventData.payload?.team_name;
    // Solo mostrar si teamName existe (lo que significa que está en la partida)
    if (teamName && teamName !== deviceId) {
      showPopup(`⚠️ ${teamName} desconectado`, "error", 3000);
    }
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
    }
    if (message.type === "event_received") {
      processEventEffects(message.data || null);
    }
  };

  socket.onclose = () => setTimeout(connectWebSocket, 1000);
}

window.addEventListener("storage", (event) => {
  if (event.key !== VIEW_STORAGE_KEY || !event.newValue) return;
  try {
    const payload = JSON.parse(event.newValue);
    if (payload.view === "results") window.location.href = "/results";
    else if (payload.view === "display") window.location.href = "/display";
  } catch (_) {}
});

loadInitialState().catch((error) => console.error("Error loading display state", error));
connectWebSocket();