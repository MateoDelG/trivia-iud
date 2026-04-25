const controlsListEl = document.getElementById("controls-list");
const eventsListEl = document.getElementById("events-list");
const gameNameEl = document.getElementById("game-name");
const questionTimeEl = document.getElementById("question-time");
const teamsListEl = document.getElementById("teams-list");
const questionsLoadedEl = document.getElementById("questions-loaded");
const totalQuestionsEl = document.getElementById("total-questions");
const questionModeEl = document.getElementById("question-mode");
const controlTemplate = document.getElementById("control-template");
const eventTemplate = document.getElementById("event-template");
const teamTemplate = document.getElementById("team-template");

let controls = [];
let events = [];
let gameConfig = null;
let teams = [];
let questionsLoaded = false;
let totalQuestions = 0;
let questionMode = "ordered";

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

function renderGameConfig() {
  if (!gameConfig) {
    gameNameEl.textContent = "No hay partida configurada.";
    gameNameEl.className = "list-empty";
    questionTimeEl.textContent = "Tiempo por pregunta: -";
    questionTimeEl.className = "list-empty";
    return;
  }

  gameNameEl.className = "";
  gameNameEl.textContent = `Partida: ${gameConfig.game_name}`;
  questionTimeEl.className = "";
  questionTimeEl.textContent = `Tiempo por pregunta: ${gameConfig.question_time} s`;
}

function renderTeams() {
  teamsListEl.innerHTML = "";

  if (teams.length === 0) {
    teamsListEl.textContent = "No hay equipos configurados.";
    teamsListEl.className = "list-empty";
    return;
  }

  teamsListEl.className = "";
  teams.forEach((team) => {
    const node = teamTemplate.content.cloneNode(true);
    node.querySelector(".team-name").textContent = team.name;
    node.querySelector(".team-control").textContent = `Control: ${team.control_id}`;
    node.querySelector(".team-score").textContent = `Puntaje: ${team.score ?? 0}`;
    teamsListEl.appendChild(node);
  });
}

function renderQuestionBank() {
  questionsLoadedEl.className = "";
  totalQuestionsEl.className = "";
  questionModeEl.className = "";
  questionsLoadedEl.textContent = `Preguntas cargadas: ${questionsLoaded ? "si" : "no"}`;
  totalQuestionsEl.textContent = `Total de preguntas: ${totalQuestions}`;
  questionModeEl.textContent = `Modo de preguntas: ${questionMode}`;
}

async function loadInitialData() {
  const [controlsRes, eventsRes, gameConfigRes, teamsRes, questionsRes] = await Promise.all([
    fetch("/api/controls"),
    fetch("/api/events"),
    fetch("/api/game-config"),
    fetch("/api/teams"),
    fetch("/api/questions"),
  ]);

  const controlsData = await controlsRes.json();
  const eventsData = await eventsRes.json();
  const gameConfigData = await gameConfigRes.json();
  const teamsData = await teamsRes.json();
  const questionsData = await questionsRes.json();

  controls = controlsData.controls || [];
  events = eventsData.events || [];
  gameConfig = gameConfigData.game_config || null;
  teams = teamsData.teams || [];
  questionsLoaded = Boolean(questionsData.questions_loaded);
  totalQuestions = Number(questionsData.total_questions || 0);
  questionMode = questionsData.question_mode || "ordered";

  renderControls();
  renderEvents();
  renderGameConfig();
  renderTeams();
  renderQuestionBank();
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

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "controls_updated") {
      controls = message.data || [];
      renderControls();
      return;
    }

    if (message.type === "event_received") {
      events = [message.data, ...events].slice(0, 100);
      renderEvents();
      return;
    }

    if (message.type === "events_snapshot") {
      events = message.data || [];
      renderEvents();
      return;
    }

    if (message.type === "game_config_updated") {
      gameConfig = message.data || null;
      renderGameConfig();
      return;
    }

    if (message.type === "teams_updated") {
      teams = message.data || [];
      renderTeams();
      return;
    }

    if (message.type === "questions_updated") {
      const data = message.data || {};
      questionsLoaded = Boolean(data.questions_loaded);
      totalQuestions = Number(data.total_questions || 0);
      questionMode = data.question_mode || questionMode;
      renderQuestionBank();
      return;
    }

    if (message.type === "questions_config_updated") {
      const data = message.data || {};
      if (data.question_mode) {
        questionMode = data.question_mode;
        renderQuestionBank();
      }
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 1000);
  };
}

loadInitialData().catch((error) => {
  console.error("Error loading initial data", error);
});
connectWebSocket();
