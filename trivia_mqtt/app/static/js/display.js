const gameNameEl = document.getElementById("display-game-name");
const statusEl = document.getElementById("display-status");
const questionIndexEl = document.getElementById("display-question-index");
const questionTextEl = document.getElementById("display-question-text");
const optionsEl = document.getElementById("display-options");
const timerEl = document.getElementById("display-timer");
const currentTeamEl = document.getElementById("display-current-team");
const rankingEl = document.getElementById("display-ranking");
const responseTimesEl = document.getElementById("display-response-times");
const popupEl = document.getElementById("display-popup");
const popupContentEl = document.getElementById("display-popup-content");

let gameState = null;
let popupTimeout = null;
let lastPopupQuestionId = null;
let pausePopupVisible = false;

function showPopup(message, type = "info", persistent = false) {
  if (!popupEl || !popupContentEl) return;
  popupContentEl.textContent = message;
  popupContentEl.className = `display-popup-content ${type}`;
  popupEl.classList.remove("hidden");

  if (popupTimeout) {
    window.clearTimeout(popupTimeout);
  }
  if (persistent) {
    pausePopupVisible = true;
    return;
  }

  pausePopupVisible = false;
  popupTimeout = window.setTimeout(() => {
    popupEl.classList.add("hidden");
  }, 3200);
}

function hidePopup() {
  if (!popupEl) return;
  if (popupTimeout) {
    window.clearTimeout(popupTimeout);
    popupTimeout = null;
  }
  popupEl.classList.add("hidden");
  pausePopupVisible = false;
}

function maybeShowEventPopup(eventData) {
  if (!eventData) return;

  if (eventData.event_type === "answer_incorrect_next_team") {
    const nextTeamId = eventData.payload?.next_team;
    const nextTeam = (gameState?.teams || []).find((team) => team.team_id === nextTeamId);
    const nextTeamName = nextTeam?.name || "Siguiente equipo";
    showPopup(`Respuesta incorrecta. Responde: ${nextTeamName}`, "warning");
  }
}

function maybeShowStatePopup() {
  if (!gameState || !gameState.current_question) return;
  if (!gameState.answer_revealed || !gameState.question_finished) return;

  const questionId = gameState.current_question.question_id;
  if (!questionId || lastPopupQuestionId === questionId) return;

  const answer = gameState.revealed_correct_answer || gameState.current_question.correct_answer;
  const explanation = gameState.current_question.explanation || gameState.current_question.feedback;

  if (gameState.current_team) {
    const messageParts = [
      `Respuesta correcta: ${gameState.current_team.name}`,
      answer ? `Respuesta: ${answer}` : "",
      explanation || "",
    ].filter(Boolean);
    showPopup(messageParts.join(" "), "success");
  } else {
    const messageParts = [
      "Todos respondieron incorrecto.",
      answer ? `Respuesta correcta: ${answer}` : "",
      explanation || "",
    ].filter(Boolean);
    showPopup(messageParts.join(" "), "error");
  }

  lastPopupQuestionId = questionId;
}

function stateMessage(status) {
  if (status === "setup") return "Esperando configuracion";
  if (status === "configured") return "Partida configurada";
  if (status === "game_running") return "Partida iniciada";
  if (status === "question_ready") return "Pregunta lista. Esperando temporizador";
  if (status === "question_active") return "Pregunta activa";
  if (status === "waiting_for_answer") return "Esperando validacion del host";
  if (status === "game_paused") return "Partida pausada";
  if (status === "question_finished") return "Pregunta finalizada";
  if (status === "game_finished") return "Partida finalizada";
  return "Esperando inicio";
}

function renderOptions(question) {
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
    option.className = "option-item";
    if (answerRevealed && revealedAnswer === letter) {
      option.classList.add("option-correct");
    }
    option.innerHTML = `<strong>${letter}</strong><span>${text}</span>`;
    optionsEl.appendChild(option);
  });
}

function renderRanking(scores) {
  if (!scores || scores.length === 0) {
    rankingEl.className = "list-empty";
    rankingEl.textContent = "Sin puntajes aun.";
    return;
  }

  rankingEl.className = "ranking-list";
  rankingEl.innerHTML = scores
    .map((team, index) => `${index + 1}. ${team.name} - ${team.score} pts`)
    .join("<br />");
}

function renderResponseTimes(pressQueue) {
  if (!pressQueue || pressQueue.length === 0) {
    responseTimesEl.className = "list-empty";
    responseTimesEl.textContent = "Sin respuestas aun.";
    return;
  }

  const sortedPresses = [...pressQueue].sort((a, b) => {
    const elapsedA = Number(a.elapsed_time || 0);
    const elapsedB = Number(b.elapsed_time || 0);
    if (elapsedA !== elapsedB) return elapsedA - elapsedB;
    const timeA = new Date(a.server_timestamp || 0).getTime();
    const timeB = new Date(b.server_timestamp || 0).getTime();
    return timeA - timeB;
  });

  responseTimesEl.className = "response-times-list";
  responseTimesEl.innerHTML = sortedPresses
    .map((press, index) => `${index + 1}. ${press.team_name} - ${Number(press.elapsed_time || 0).toFixed(2)} s`)
    .join("<br />");
}

function renderState() {
  if (!gameState) return;

  if (!gameState.answer_revealed || !gameState.current_question) {
    lastPopupQuestionId = null;
  }

  gameNameEl.textContent = gameState.game_name || "TriviaMQTT";
  statusEl.textContent = stateMessage(gameState.game_status);

  if (gameState.game_status === "game_paused") {
    const pauseReason = gameState.game_pause_reason || "Partida pausada";
    showPopup(`Partida pausada: ${pauseReason}`, "warning", true);
  } else if (pausePopupVisible) {
    hidePopup();
  }

  const index = Number(gameState.current_question_index ?? -1);
  const total = Number(gameState.total_questions ?? 0);
  questionIndexEl.textContent = `Pregunta ${index >= 0 ? index + 1 : "-"}/${total || "-"}`;

  questionTextEl.textContent = gameState.current_question?.text || "Esperando pregunta...";
  renderOptions(gameState.current_question);

  timerEl.textContent = `${Number(gameState.question_remaining_time ?? 0)} s`;
  currentTeamEl.textContent = `Equipo en turno: ${gameState.current_team?.name || "-"}`;
  renderRanking(gameState.scores || []);
  renderResponseTimes(gameState.press_queue || []);
  if (gameState.game_status !== "game_paused") {
    maybeShowStatePopup();
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
      maybeShowEventPopup(message.data || null);
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 1000);
  };
}

loadInitialState().catch((error) => {
  console.error("Error loading display state", error);
});
connectWebSocket();
