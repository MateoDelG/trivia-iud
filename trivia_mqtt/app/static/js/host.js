const controlsListEl = document.getElementById("controls-list");
const eventsListEl = document.getElementById("events-list");
const gameStatusEl = document.getElementById("game-status");
const gameNameEl = document.getElementById("game-name");
const questionTimeEl = document.getElementById("question-time");
const questionModeEl = document.getElementById("question-mode");
const questionsLoadedEl = document.getElementById("questions-loaded");
const totalQuestionsEl = document.getElementById("total-questions");
const questionIndexEl = document.getElementById("question-index");
const questionTextEl = document.getElementById("question-text");
const questionOptionsEl = document.getElementById("question-options");
const questionCorrectEl = document.getElementById("question-correct");
const questionExplanationEl = document.getElementById("question-explanation");
const questionTimerEl = document.getElementById("question-timer");
const currentTeamEl = document.getElementById("current-team");
const pressQueueEl = document.getElementById("press-queue");
const rankingListEl = document.getElementById("ranking-list");
const teamsListEl = document.getElementById("teams-list");
const hostActionMessageEl = document.getElementById("host-action-message");
const hostPopupEl = document.getElementById("host-popup");
const hostPopupContentEl = document.getElementById("host-popup-content");

const btnGameStart = document.getElementById("btn-game-start");
const btnQuestionStart = document.getElementById("btn-question-start");
const btnTimerStart = document.getElementById("btn-timer-start");
const btnGamePause = document.getElementById("btn-game-pause");
const btnGameResume = document.getElementById("btn-game-resume");
const btnAnswerCorrect = document.getElementById("btn-answer-correct");
const btnAnswerIncorrect = document.getElementById("btn-answer-incorrect");
const btnQuestionSkip = document.getElementById("btn-question-skip");
const btnGameEnd = document.getElementById("btn-game-end");

const controlTemplate = document.getElementById("control-template");
const eventTemplate = document.getElementById("event-template");
const teamTemplate = document.getElementById("team-template");

let controls = [];
let events = [];
let gameState = null;
let hostPopupTimeout = null;
const statusPopupTimestamps = new Map();
const controlPrevStatus = new Map();

function setActionMessage(text, type = "info") {
  hostActionMessageEl.textContent = text;
  hostActionMessageEl.className = "";
  if (type === "error") hostActionMessageEl.classList.add("message-error");
  if (type === "success") hostActionMessageEl.classList.add("message-success");
}

function showHostPopup(message) {
  if (!hostPopupEl || !hostPopupContentEl) return;
  hostPopupContentEl.textContent = message;
  hostPopupEl.classList.remove("hidden");

  if (hostPopupTimeout) {
    window.clearTimeout(hostPopupTimeout);
  }
  hostPopupTimeout = window.setTimeout(() => {
    hostPopupEl.classList.add("hidden");
  }, 3600);
}

function isActiveGameStatus(status) {
  return ["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished"].includes(
    status
  );
}

function maybeShowControlStatusPopup(eventData) {
  if (!eventData || eventData.event_type !== "status_update") return;
  const status = String(eventData.payload?.status || "").toLowerCase();
  if (!status || (status !== "offline" && status !== "online")) return;

  const gameStatus = gameState?.game_status || "setup";
  if (!isActiveGameStatus(gameStatus)) return;

  const deviceId = eventData.device_id || eventData.payload?.device_id || "control";
  const prevStatus = controlPrevStatus.get(deviceId);

  if (status === "offline") {
    if (prevStatus === "online") {
      const team = (gameState?.teams || []).find((item) => item.control_id === deviceId);
      const teamSuffix = team ? ` (${team.name})` : "";
      showHostPopup(`Control desconectado: ${deviceId}${teamSuffix}`);
    }
    controlPrevStatus.set(deviceId, "offline");
    return;
  }

  if (status === "online") {
    if (prevStatus === "offline") {
      const team = (gameState?.teams || []).find((item) => item.control_id === deviceId);
      const teamSuffix = team ? ` (${team.name})` : "";
      showHostPopup(`Control reconectado: ${deviceId}${teamSuffix}`);
    }
    controlPrevStatus.set(deviceId, "online");
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString();
}

function renderControls() {
  controlsListEl.innerHTML = "";

  if (controls.length === 0) {
    controlsListEl.innerHTML = "No hay controles detectados.";
    controlsListEl.className = "list-empty";
    return;
  }

  controlsListEl.className = "";
  controls.forEach((control) => {
    const node = controlTemplate.content.cloneNode(true);
    const status = String(control.status || "waiting").toLowerCase();
    node.querySelector(".control-id").textContent = control.device_id;
    const statusEl = node.querySelector(".control-status");
    statusEl.textContent = `Estado: ${status}`;
    statusEl.classList.remove("status-offline", "status-waiting");
    if (status === "offline") {
      statusEl.classList.add("status-offline");
    } else if (status === "waiting" || status === "unknown") {
      statusEl.classList.add("status-waiting");
    }
    node.querySelector(".control-last-seen").textContent = `Ultima conexion: ${formatDate(control.last_seen)}`;

    node.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        const mode = button.dataset.mode;
        await sendLedCommand(control.device_id, mode);
      });
    });

    controlsListEl.appendChild(node);
  });
}

function renderEvents() {
  eventsListEl.innerHTML = "";

  if (events.length === 0) {
    eventsListEl.innerHTML = "No hay eventos todavia.";
    eventsListEl.className = "list-empty";
    return;
  }

  eventsListEl.className = "";
  events.forEach((eventItem) => {
    const node = eventTemplate.content.cloneNode(true);
    node.querySelector(".event-time").textContent = formatDate(eventItem.timestamp);
    node.querySelector(".event-device").textContent = eventItem.device_id;
    const message = eventItem.message || eventItem.event_type;
    node.querySelector(".event-message").textContent = message;
    eventsListEl.appendChild(node);
  });
}

function renderQuestionOptions(question) {
  questionOptionsEl.innerHTML = "";
  if (!question) {
    questionOptionsEl.className = "list-empty";
    questionOptionsEl.textContent = "Sin opciones disponibles.";
    return;
  }

  questionOptionsEl.className = "question-options";
  const options = [
    ["A", question.option_a],
    ["B", question.option_b],
    ["C", question.option_c],
    ["D", question.option_d],
  ];

  const revealedAnswer = gameState?.revealed_correct_answer || null;
  const answerRevealed = Boolean(gameState?.answer_revealed);

  options.forEach(([letter, text]) => {
    const item = document.createElement("article");
    item.className = "option-item";
    if (answerRevealed && revealedAnswer === letter) {
      item.classList.add("option-correct");
    }
    item.innerHTML = `<strong>${letter}</strong><span>${text}</span>`;
    questionOptionsEl.appendChild(item);
  });
}

function renderQueue(queue) {
  pressQueueEl.innerHTML = "";
  if (!queue || queue.length === 0) {
    pressQueueEl.className = "press-queue list-empty";
    pressQueueEl.innerHTML = "<li>No hay pulsaciones registradas.</li>";
    return;
  }

  pressQueueEl.className = "press-queue";
  queue.forEach((press, index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${press.team_name} - ${Number(press.elapsed_time).toFixed(2)} s`;
    pressQueueEl.appendChild(li);
  });
}

function renderRanking(scores) {
  if (!scores || scores.length === 0) {
    rankingListEl.className = "list-empty";
    rankingListEl.textContent = "Sin puntajes aun.";
    return;
  }

  const responseTimesByTeam = new Map(
    (gameState?.press_queue || []).map((press) => [press.team_id, Number(press.elapsed_time || 0)])
  );

  rankingListEl.className = "ranking-list";
  rankingListEl.innerHTML = scores
    .map((team, index) => {
      const responseTime = responseTimesByTeam.has(team.team_id)
        ? `${responseTimesByTeam.get(team.team_id).toFixed(2)} s`
        : "-";
      return `${index + 1}. ${team.name} - ${team.score} pts (Respuesta: ${responseTime})`;
    })
    .join("<br />");
}

function renderTeams(teams) {
  teamsListEl.innerHTML = "";
  if (!teams || teams.length === 0) {
    teamsListEl.className = "list-empty";
    teamsListEl.textContent = "No hay equipos configurados.";
    return;
  }

  teamsListEl.className = "";
  const responseTimesByTeam = new Map(
    (gameState?.press_queue || []).map((press) => [press.team_id, Number(press.elapsed_time || 0)])
  );

  teams.forEach((team) => {
    const node = teamTemplate.content.cloneNode(true);
    node.querySelector(".team-name").textContent = team.name;
    node.querySelector(".team-control").textContent = `Control: ${team.control_id}`;
    const responseTime = responseTimesByTeam.has(team.team_id)
      ? `${responseTimesByTeam.get(team.team_id).toFixed(2)} s`
      : "-";
    node.querySelector(".team-stats").textContent = `Puntaje: ${team.score} | C:${team.correct_answers} I:${team.incorrect_answers} P:${team.total_presses} | Tiempo respuesta: ${responseTime}`;
    teamsListEl.appendChild(node);
  });
}

function renderGameState() {
  if (!gameState) return;

  gameStatusEl.textContent = gameState.game_status || "setup";
  gameNameEl.textContent = gameState.game_name ? `Partida: ${gameState.game_name}` : "No hay partida configurada.";
  questionTimeEl.textContent = `Tiempo por pregunta: ${Number(gameState.question_time || 0)} s`;
  questionModeEl.textContent = `Modo de preguntas: ${gameState.question_mode || "ordered"}`;
  questionsLoadedEl.textContent = `Preguntas cargadas: ${gameState.questions_loaded ? "si" : "no"}`;
  totalQuestionsEl.textContent = `Total de preguntas: ${Number(gameState.total_bank_questions || 0)}`;

  const qIndex = Number(gameState.current_question_index ?? -1);
  const qTotal = Number(gameState.total_questions ?? 0);
  questionIndexEl.textContent = `Pregunta ${qIndex >= 0 ? qIndex + 1 : "-"}/${qTotal || "-"}`;
  questionTextEl.textContent = gameState.current_question?.text || "Sin pregunta activa.";
  renderQuestionOptions(gameState.current_question);
  questionCorrectEl.textContent = `Respuesta correcta: ${gameState.current_question?.correct_answer || "-"}`;
  if (gameState.answer_revealed) {
    const explanation = gameState.current_question?.explanation || gameState.current_question?.feedback;
    questionExplanationEl.textContent = explanation
      ? `Explicacion: ${explanation}`
      : "Explicacion: no registrada para esta pregunta.";
    questionExplanationEl.className = "host-explanation";
  } else {
    questionExplanationEl.textContent = "Explicacion: se muestra al validar la pregunta.";
    questionExplanationEl.className = "host-explanation list-empty";
  }
  questionTimerEl.textContent = `${Number(gameState.question_remaining_time || 0)} s`;
  currentTeamEl.textContent = `Equipo en turno: ${gameState.current_team?.name || "-"}`;

  renderQueue(gameState.press_queue || []);
  renderRanking(gameState.scores || []);
  renderTeams(gameState.teams || []);
  updateButtons();
}

function getDisconnectedAssignedControls() {
  const teams = gameState?.teams || [];
  const controlsById = new Map((controls || []).map((control) => [control.device_id, String(control.status || "").toLowerCase()]));

  return teams
    .filter((team) => controlsById.get(team.control_id) !== "online")
    .map((team) => ({ teamName: team.name, controlId: team.control_id }));
}

function updateButtons() {
  const status = gameState?.game_status || "setup";
  const hasCurrentTeam = Boolean(gameState?.current_team);
  const canStartGame = (gameState?.questions_loaded && (gameState?.teams || []).length > 0) || false;
  const disconnectedAssigned = getDisconnectedAssignedControls();
  const hasDisconnectedAssigned = disconnectedAssigned.length > 0;
  const isPaused = status === "game_paused";

  btnGameStart.disabled =
    !canStartGame || ["game_running", "question_active", "waiting_for_answer", "game_paused"].includes(status);
  btnQuestionStart.disabled = !["game_running", "question_finished"].includes(status) || hasDisconnectedAssigned || isPaused;
  btnTimerStart.disabled = status !== "question_ready" || hasDisconnectedAssigned || isPaused;
  btnGamePause.disabled =
    !["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished"].includes(status) ||
    isPaused;
  btnGameResume.disabled = status !== "game_paused" || hasDisconnectedAssigned;
  btnAnswerCorrect.disabled = !hasCurrentTeam || !["question_active", "waiting_for_answer"].includes(status) || isPaused;
  btnAnswerIncorrect.disabled = !hasCurrentTeam || !["question_active", "waiting_for_answer"].includes(status) || isPaused;
  btnQuestionSkip.disabled = !["question_ready", "question_active", "waiting_for_answer"].includes(status) || isPaused;
  btnGameEnd.disabled = ![
    "game_running",
    "question_ready",
    "question_active",
    "waiting_for_answer",
    "question_finished",
    "game_paused",
  ].includes(
    status
  );

  if (
    hasDisconnectedAssigned &&
    ["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished"].includes(status)
  ) {
    const first = disconnectedAssigned[0];
    setActionMessage(
      `Control desconectado (${first.controlId} / ${first.teamName}). No se puede iniciar siguiente pregunta ni temporizador.`,
      "error"
    );
    return;
  }

  if (isPaused && gameState?.game_pause_reason) {
    setActionMessage(`Partida pausada: ${gameState.game_pause_reason}`, "error");
  }
}

async function callGameAction(endpoint) {
  const response = await fetch(endpoint, { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    setActionMessage(data.detail || data.message || "No se pudo ejecutar la accion.", "error");
    return null;
  }
  setActionMessage(data.message || "Accion ejecutada correctamente.", "success");
  return data;
}

async function sendLedCommand(deviceId, mode) {
  const response = await fetch(`/api/controls/${encodeURIComponent(deviceId)}/led`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload.detail || "Error enviando comando LED";
    window.alert(detail);
  }
}

async function loadInitialData() {
  const [controlsRes, eventsRes, gameStateRes] = await Promise.all([
    fetch("/api/controls"),
    fetch("/api/events"),
    fetch("/api/game/state"),
  ]);

  const controlsData = await controlsRes.json();
  const eventsData = await eventsRes.json();
  const gameStateData = await gameStateRes.json();

  controls = controlsData.controls || [];
  events = eventsData.events || [];
  gameState = gameStateData || {};

  renderControls();
  renderEvents();
  renderGameState();
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "controls_updated") {
      controls = message.data || [];
      renderControls();
      updateButtons();
      return;
    }

    if (message.type === "event_received") {
      maybeShowControlStatusPopup(message.data || null);
      events = [message.data, ...events].slice(0, 100);
      renderEvents();
      return;
    }

    if (message.type === "events_snapshot") {
      events = message.data || [];
      renderEvents();
      return;
    }

    if (message.type === "game_state_updated") {
      gameState = message.data || {};
      renderGameState();
      updateButtons();
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 1000);
  };
}

btnGameStart.addEventListener("click", async () => {
  await callGameAction("/api/game/start");
});

btnQuestionStart.addEventListener("click", async () => {
  await callGameAction("/api/game/question/start");
});

btnTimerStart.addEventListener("click", async () => {
  await callGameAction("/api/game/question/timer/start");
});

btnGamePause.addEventListener("click", async () => {
  await callGameAction("/api/game/pause");
});

btnGameResume.addEventListener("click", async () => {
  await callGameAction("/api/game/resume");
});

btnAnswerCorrect.addEventListener("click", async () => {
  await callGameAction("/api/game/answer/correct");
});

btnAnswerIncorrect.addEventListener("click", async () => {
  await callGameAction("/api/game/answer/incorrect");
});

btnQuestionSkip.addEventListener("click", async () => {
  await callGameAction("/api/game/question/skip");
});

btnGameEnd.addEventListener("click", async () => {
  await callGameAction("/api/game/end");
});

loadInitialData().catch((error) => {
  console.error("Error loading initial data", error);
  setActionMessage("No se pudo cargar el estado inicial.", "error");
});
connectWebSocket();
