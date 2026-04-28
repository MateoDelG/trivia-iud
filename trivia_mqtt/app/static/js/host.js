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
const hostPopupBackdropEl = document.getElementById("host-popup-backdrop");
const overviewStateEl = document.getElementById("overview-state");
const overviewStateSubEl = document.getElementById("overview-state-sub");
const overviewQuestionEl = document.getElementById("overview-question");
const overviewRoundSubEl = document.getElementById("overview-round-sub");
const overviewTeamEl = document.getElementById("overview-team");
const overviewTimerEl = document.getElementById("overview-timer");
const overviewTimerSubEl = document.getElementById("overview-timer-sub");

const btnGameStart = document.getElementById("btn-game-start");
const btnQuestionStart = document.getElementById("btn-question-start");
const btnTimerStart = document.getElementById("btn-timer-start");
const btnGamePause = document.getElementById("btn-game-pause");
const btnGameResume = document.getElementById("btn-game-resume");
const btnAnswerCorrect = document.getElementById("btn-answer-correct");
const btnAnswerIncorrect = document.getElementById("btn-answer-incorrect");
const btnQuestionSkip = document.getElementById("btn-question-skip");
const btnGameEnd = document.getElementById("btn-game-end");
const btnToggleDisplay = document.getElementById("btn-toggle-display");
const controlTemplate = document.getElementById("control-template");
const eventTemplate = document.getElementById("event-template");
const teamTemplate = document.getElementById("team-template");

let currentDisplayView = "display";
let events = [];
let gameState = null;
let hostPopupTimeout = null;
let socket = null;
const statusPopupTimestamps = new Map();
const controlPrevStatus = new Map();

function setActionMessage(text, type = "info") {
  hostActionMessageEl.textContent = text;
  hostActionMessageEl.className = "host-alert";
  if (type === "error") hostActionMessageEl.classList.add("host-alert-danger");
  else if (type === "success") hostActionMessageEl.classList.add("host-alert-success");
  else if (type === "warning") hostActionMessageEl.classList.add("host-alert-warning");
  else hostActionMessageEl.classList.add("host-alert-info");
}

function showHostPopup(message, type = "warning") {
  if (!hostPopupEl || !hostPopupContentEl || !hostPopupBackdropEl) return;
  hostPopupContentEl.textContent = message;
  hostPopupContentEl.className = `host-popup-content ${type}`;
  hostPopupEl.classList.remove("hidden");
  hostPopupBackdropEl.classList.remove("hidden");

  if (hostPopupTimeout) {
    window.clearTimeout(hostPopupTimeout);
  }
  hostPopupTimeout = window.setTimeout(() => {
    hostPopupEl.classList.add("hidden");
    hostPopupBackdropEl.classList.add("hidden");
  }, 3600);
}

function isActiveGameStatus(status) {
  return ["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished", "game_paused"].includes(
    status
  );
}

function maybeShowControlStatusPopup(eventData) {
  if (!eventData) return;
  const eventType = String(eventData.event_type || "").toLowerCase();
  if (!["status_update", "control_online", "control_offline"].includes(eventType)) return;

  let status = String(eventData.payload?.status || "").toLowerCase();
  if (!status) {
    if (eventType === "control_online") status = "online";
    if (eventType === "control_offline") status = "offline";
  }
  if (!status || (status !== "offline" && status !== "online")) return;

  const gameStatus = gameState?.game_status || "setup";
  const canNotify = isActiveGameStatus(gameStatus);

  const deviceId = eventData.device_id || eventData.payload?.device_id || "control";
  const prevStatus = controlPrevStatus.get(deviceId);

  if (status === "offline") {
    if (canNotify && prevStatus === "online") {
      const team = (gameState?.teams || []).find((item) => item.control_id === deviceId);
      const teamSuffix = team ? ` (${formatTeamName(team.name)})` : "";
      showHostPopup(`Control desconectado: ${deviceId}${teamSuffix}`, "error");
    }
    controlPrevStatus.set(deviceId, "offline");
    return;
  }

  if (status === "online") {
    if (canNotify && prevStatus === "offline") {
      const team = (gameState?.teams || []).find((item) => item.control_id === deviceId);
      const teamSuffix = team ? ` (${formatTeamName(team.name)})` : "";
      showHostPopup(`Control reconectado: ${deviceId}${teamSuffix}`, "success");
    }
    controlPrevStatus.set(deviceId, "online");
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString();
}

function formatSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)} s`;
}

function formatEventType(type) {
  const map = {
    status_update: "Estado",
    button_pressed: "Pulsacion",
    question_finished: "Pregunta",
    answer_correct: "Correcta",
    answer_incorrect: "Incorrecta",
    answer_incorrect_next_team: "Incorrecta",
    answer_incorrect_no_more_teams: "Incorrecta",
    question_timeout_no_answers: "Temporizador",
    question_timeout_with_queue: "Temporizador",
    question_timeout_waiting_validation: "Temporizador",
    timer_started: "Temporizador",
    timer_stopped: "Temporizador",
    control_offline: "Control",
    control_online: "Control",
  };
  return map[type] || "Sistema";
}

function formatEventTime(value) {
  if (!value) return "-";
  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  } catch (_error) {
  }
  return String(value);
}

function formatEventDescription(event) {
  return (
    event?.description ||
    event?.message ||
    event?.event ||
    event?.type ||
    formatEventType(event?.event_type) ||
    "Evento del sistema"
  );
}

function formatEventSource(event) {
  const raw = event?.source || event?.device_id || event?.control_id;
  if (raw) return String(raw);
  return formatEventType(event?.event_type) || "Sistema";
}

function formatMMSS(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTeamName(name) {
  if (name === null || name === undefined) return "-";
  const raw = String(name).trim();
  if (!raw) return "-";
  if (/^\d+$/.test(raw)) return `Equipo ${raw}`;

  const lowerWords = ["de", "del", "la", "las", "el", "los", "y", "e"];
  return raw
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => (lowerWords.includes(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function formatGameStatus(status) {
  const map = {
    setup: "Configuración",
    configured: "Partida configurada",
    game_ready: "Partida lista",
    game_running: "Partida en curso",
    question_ready: "Pregunta lista",
    question_active: "Pregunta activa",
    waiting_for_answer: "Turno de respuesta",
    question_finished: "Pregunta finalizada",
    game_paused: "Pausado",
    paused: "Pausado",
    game_finished: "Partida finalizada",
  };
  return map[status] || status || "Sin estado";
}

function formatQuestionMode(mode) {
  const map = { ordered: "En orden", random: "Aleatorio" };
  return map[mode] || mode || "-";
}

function formatBooleanLabel(value) {
  if (value === true || value === "true" || value === "si" || value === "sí") return "Sí";
  if (value === false || value === "false" || value === "no") return "No";
  return value || "-";
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
    statusEl.textContent = status === "online" ? "En linea" : status === "offline" ? "Desconectado" : "Esperando";
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
    eventsListEl.innerHTML = '<div class="empty-state">Aun no hay eventos registrados</div>';
    eventsListEl.className = "event-history-list list-empty";
    return;
  }

  eventsListEl.className = "event-history-list";
  events.slice(0, 30).forEach((eventItem) => {
    const node = eventTemplate.content.cloneNode(true);
    node.querySelector(".event-time").textContent = formatEventTime(eventItem.timestamp || eventItem.time || eventItem.created_at);
    node.querySelector(".event-device").textContent = formatEventSource(eventItem);
    node.querySelector(".event-message").textContent = formatEventDescription(eventItem);
    eventsListEl.appendChild(node);
  });
}

function renderQuestionOptions(question) {
  questionOptionsEl.innerHTML = "";
  if (!question) {
    questionOptionsEl.className = "host-options-grid";
    questionOptionsEl.innerHTML = '<div class="host-options-empty">Sin opciones disponibles.</div>';
    return;
  }

  questionOptionsEl.className = "host-options-grid";
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
    item.className = "host-option-card neutral";
    if (answerRevealed && revealedAnswer === letter) {
      item.classList.remove("neutral");
      item.classList.add("correct", "host-option-correct");
    }
    item.innerHTML = `<span class="host-option-letter">${letter}</span><span class="host-option-text">${text || "-"}</span>`;
    questionOptionsEl.appendChild(item);
  });
}

function renderQueue(queue) {
  pressQueueEl.innerHTML = "";
  if (!queue || queue.length === 0) {
    pressQueueEl.className = "press-queue-list press-queue-empty";
    pressQueueEl.innerHTML = '<li class="press-queue-item"><span class="press-queue-team">Sin pulsaciones registradas</span></li>';
    return;
  }

  pressQueueEl.className = "press-queue-list";
  queue.forEach((press, index) => {
    const li = document.createElement("li");
    li.className = "press-queue-item";
    li.innerHTML = `<span class="press-queue-order">${index + 1}.</span><span class="press-queue-team">${formatTeamName(press.team_name)}</span><span class="press-queue-time">${Number(press.elapsed_time).toFixed(2)} s</span>`;
    pressQueueEl.appendChild(li);
  });
}

function renderRanking(scores) {
  if (!scores || scores.length === 0) {
    rankingListEl.className = "list-empty";
    rankingListEl.textContent = "No hay equipos configurados";
    return;
  }

  const responseTimesByTeam = new Map(
    (gameState?.press_queue || []).map((press) => [press.team_id, Number(press.elapsed_time || 0)])
  );

  rankingListEl.className = "host-ranking-list";
  rankingListEl.innerHTML = scores
    .map((team, index) => {
      const responseTime = responseTimesByTeam.has(team.team_id)
        ? formatSeconds(responseTimesByTeam.get(team.team_id))
        : "-";
      const leaderClass = index === 0 ? "host-ranking-leader" : "";
      return `<article class="host-ranking-item ${leaderClass}"><span class="ranking-position">${index + 1}</span><div><div class="ranking-team">${formatTeamName(team.name)}</div><div class="ranking-meta">Respuesta: ${responseTime}</div></div><span class="ranking-score">${team.score} pts</span></article>`;
    })
    .join("");
}

function renderTeams(teams) {
  teamsListEl.innerHTML = "";
  if (!teams || teams.length === 0) {
    teamsListEl.className = "list-empty";
    teamsListEl.textContent = "No hay equipos configurados.";
    return;
  }

  teamsListEl.className = "configured-teams-grid";
  const responseTimesByTeam = new Map(
    (gameState?.press_queue || []).map((press) => [press.team_id, Number(press.elapsed_time || 0)])
  );

  teams.forEach((team) => {
    const node = teamTemplate.content.cloneNode(true);
    node.querySelector(".team-name").textContent = formatTeamName(team.name);
    node.querySelector(".team-control").textContent = `Control: ${team.control_id || "-"}`;
    const responseTime = responseTimesByTeam.has(team.team_id)
      ? formatSeconds(responseTimesByTeam.get(team.team_id))
      : "-";
    node.querySelector(".team-stats").innerHTML = `
      <span class="configured-team-row"><span class="configured-team-label">Puntaje</span><span class="configured-team-value">${Number(team.score || 0)} pts</span></span>
      <span class="configured-team-row"><span class="configured-team-label">C / I / P</span><span class="configured-team-value">${Number(team.correct_answers || 0)} / ${Number(team.incorrect_answers || 0)} / ${Number(team.total_presses || 0)}</span></span>
      <span class="configured-team-row"><span class="configured-team-label">Tiempo de respuesta</span><span class="configured-team-value">${responseTime}</span></span>
    `;
    teamsListEl.appendChild(node);
  });
}

function renderGameState() {
  if (!gameState) return;

  const status = gameState.game_status || "setup";
  gameStatusEl.textContent = formatGameStatus(status);
  gameStatusEl.className = `state-badge status-${status}`;
  gameNameEl.textContent = gameState.game_name || "No hay partida configurada.";
  questionTimeEl.textContent = `${Number(gameState.question_time || 0)} s`;
  questionModeEl.textContent = formatQuestionMode(gameState.question_mode || "ordered");
  questionsLoadedEl.textContent = formatBooleanLabel(gameState.questions_loaded);
  totalQuestionsEl.textContent = `${Number(gameState.total_bank_questions || 0)}`;

  const qIndex = Number(gameState.current_question_index ?? -1);
  const qTotal = Number(gameState.total_questions ?? 0);
  questionIndexEl.textContent = `Pregunta ${qIndex >= 0 ? qIndex + 1 : "-"}/${qTotal || "-"}`;
  questionTextEl.textContent = gameState.current_question?.text || "Sin pregunta activa.";
  questionTextEl.classList.toggle("question-long", (gameState.current_question?.text || "").length > 100);
  renderQuestionOptions(gameState.current_question);
  questionCorrectEl.textContent = `Respuesta correcta: ${gameState.current_question?.correct_answer || "-"}`;
  if (gameState.answer_revealed && gameState.current_question) {
    const explanation = gameState.current_question?.explanation || gameState.current_question?.feedback;
    questionExplanationEl.textContent = explanation
      ? `Explicacion: ${explanation}`
      : "Explicacion: no registrada para esta pregunta.";
    questionCorrectEl.parentElement?.classList.remove("hidden");
    questionCorrectEl.className = "question-correct-answer";
    questionExplanationEl.className = "question-explanation";
  } else {
    questionCorrectEl.textContent = "";
    questionCorrectEl.className = "question-correct-answer hidden";
    questionExplanationEl.textContent = "";
    questionExplanationEl.className = "question-explanation hidden";
    questionCorrectEl.parentElement?.classList.add("hidden");
  }
  const remaining = Number(gameState.question_remaining_time || 0);
  questionTimerEl.textContent = `${remaining} s`;
  currentTeamEl.className = "current-turn-team";
  if (status === "game_finished") {
    currentTeamEl.textContent = "Partida finalizada";
    currentTeamEl.classList.add("is-muted");
  } else if (status === "question_finished") {
    currentTeamEl.textContent = gameState.current_team?.name
      ? `Turno finalizado: ${formatTeamName(gameState.current_team?.name)}`
      : "Pregunta finalizada";
    currentTeamEl.classList.add("is-muted");
  } else if (gameState.current_team?.name) {
    currentTeamEl.textContent = `Equipo en turno: ${formatTeamName(gameState.current_team?.name)}`;
  } else {
    currentTeamEl.textContent = "Sin equipo en turno";
    currentTeamEl.classList.add("is-muted");
  }

  if (overviewStateEl) {
    overviewStateEl.textContent = formatGameStatus(status);
    overviewStateSubEl.textContent = gameState.game_pause_reason || stateDescription(status);
    overviewQuestionEl.textContent = `${qIndex >= 0 ? qIndex + 1 : "-"} / ${qTotal || "-"}`;
    overviewRoundSubEl.textContent = qIndex >= 0 ? `Pregunta ${qIndex + 1}` : "Ronda -";
    overviewTeamEl.textContent = gameState.current_team?.name ? formatTeamName(gameState.current_team.name) : "Sin turno";
    if (overviewTimerEl) {
      overviewTimerEl.textContent = formatMMSS(gameState.question_remaining_time || 0);
    }
    if (overviewTimerSubEl) {
      overviewTimerSubEl.textContent =
        status === "game_paused"
          ? "Pausado"
          : status === "question_active"
            ? "En curso"
            : status === "question_finished" || status === "game_finished"
              ? "Finalizado"
              : "Sin temporizador";
    }
  }

  renderQueue(gameState.press_queue || []);
  renderRanking(gameState.scores || []);
  renderTeams(gameState.teams || []);
  updateButtons();
}

function stateDescription(status) {
  if (status === "game_running") return "Partida activa";
  if (status === "question_ready") return "Esperando temporizador";
  if (status === "question_active") return "Ronda en curso";
  if (status === "waiting_for_answer") return "Esperando validacion";
  if (status === "question_finished") return "Pregunta finalizada";
  if (status === "game_paused") return "Pausa manual";
  if (status === "game_finished") return "Partida finalizada";
  if (status === "configured") return "Lista para iniciar";
  return "Sin partida";
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
    !canStartGame || ["game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished", "game_paused"].includes(status);
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

  if (isPaused) {
    const pauseReason = String(gameState?.game_pause_reason || "").trim();
    const pauseByDisconnect = /control\s+desconectado/i.test(pauseReason);

    if (pauseByDisconnect && !hasDisconnectedAssigned) {
      setActionMessage("Control reconectado: ahora puedes reanudar", "info");
      return;
    }

    if (pauseReason) {
      setActionMessage(`Partida pausada: ${pauseReason}`, "error");
      return;
    }

    setActionMessage("Partida pausada.", "info");
    return;
  }

  setActionMessage("Listo para operar.", "info");
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

function toggleDisplayView() {
  currentDisplayView = currentDisplayView === "display" ? "results" : "display";
  localStorage.setItem("display_view", JSON.stringify({ view: currentDisplayView, ts: Date.now() }));
  btnToggleDisplay.textContent = currentDisplayView === "display" ? "Ver resultados" : "Volver a display";
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
  socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

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

btnToggleDisplay.addEventListener("click", () => {
  toggleDisplayView();
});
