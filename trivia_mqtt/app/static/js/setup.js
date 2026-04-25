const gameNameEl = document.getElementById("game-name");
const questionTimeEl = document.getElementById("question-time");
const teamCountEl = document.getElementById("team-count");
const detectedControlsEl = document.getElementById("detected-controls");
const teamsFormEl = document.getElementById("teams-form");
const saveConfigBtn = document.getElementById("save-config-btn");
const validationMessagesEl = document.getElementById("validation-messages");
const teamRowTemplate = document.getElementById("team-row-template");

const questionFileEl = document.getElementById("question-file");
const uploadQuestionsBtnEl = document.getElementById("upload-questions-btn");
const questionModeSelectEl = document.getElementById("question-mode-select");
const questionsCounterEl = document.getElementById("questions-counter");
const questionsUploadMessagesEl = document.getElementById("questions-upload-messages");
const questionsErrorsEl = document.getElementById("questions-errors");
const questionsPreviewBodyEl = document.getElementById("questions-preview-body");

const DRAFT_STORAGE_KEY = "trivia_mqtt_setup_draft_v1";
const MIN_TEAMS = 1;
const MAX_TEAMS = 10;
const DEFAULT_QUESTION_TIME = 20;
const MIN_QUESTION_TIME = 5;
const MAX_QUESTION_TIME = 120;

let controls = [];
let currentConfig = null;
let questionMode = "ordered";
let totalQuestions = 0;
let questionsLoaded = false;
let questionsPreview = [];
let draft = {
  game_name: "",
  question_time: DEFAULT_QUESTION_TIME,
  team_count: 1,
  teams: [],
};

function setMessage(text, type = "info") {
  validationMessagesEl.textContent = text;
  validationMessagesEl.className = "";
  if (type === "error") validationMessagesEl.classList.add("message-error");
  if (type === "success") validationMessagesEl.classList.add("message-success");
}

function setQuestionsMessage(text, type = "info") {
  questionsUploadMessagesEl.textContent = text;
  questionsUploadMessagesEl.className = "";
  if (type === "error") questionsUploadMessagesEl.classList.add("message-error");
  if (type === "success") questionsUploadMessagesEl.classList.add("message-success");
}

function clampQuestionTime(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return DEFAULT_QUESTION_TIME;
  return Math.min(MAX_QUESTION_TIME, Math.max(MIN_QUESTION_TIME, Math.round(parsed)));
}

function renderDetectedControls() {
  if (controls.length === 0) {
    detectedControlsEl.textContent = "No hay controles detectados.";
    detectedControlsEl.className = "list-empty";
    return;
  }

  detectedControlsEl.className = "";
  detectedControlsEl.textContent = controls.map((control) => control.device_id).join(", ");
}

function normalizeDraft(raw) {
  const teamCount = Number(raw?.team_count) || MIN_TEAMS;
  const safeTeamCount = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, teamCount));
  const normalizedTeams = [];
  for (let i = 1; i <= safeTeamCount; i += 1) {
    const teamId = makeTeamId(i);
    const source = raw?.teams?.find((item) => item.team_id === teamId) || {};
    normalizedTeams.push({
      team_id: teamId,
      name: source.name || "",
      control_id: source.control_id || "",
    });
  }

  return {
    game_name: raw?.game_name || "",
    question_time: clampQuestionTime(raw?.question_time ?? DEFAULT_QUESTION_TIME),
    team_count: safeTeamCount,
    teams: normalizedTeams,
  };
}

function saveDraft() {
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function makeTeamId(teamNumber) {
  return `team_${String(teamNumber).padStart(2, "0")}`;
}

function clearDraftStorage() {
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
}

function loadDraftFromStorage() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeDraft(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function draftFromConfig(config) {
  if (!config) return normalizeDraft(null);
  return normalizeDraft({
    game_name: config.game_name,
    question_time: config.question_time,
    team_count: config.teams.length,
    teams: config.teams.map((team) => ({
      team_id: team.team_id,
      name: team.name,
      control_id: team.control_id,
    })),
  });
}

function syncDraftFromForm() {
  draft.game_name = gameNameEl.value;
  draft.question_time = clampQuestionTime(questionTimeEl.value);
  draft.team_count = Number(teamCountEl.value);
  draft.teams = draft.teams.slice(0, draft.team_count);

  const rows = [...teamsFormEl.querySelectorAll(".team-row")];
  rows.forEach((row, index) => {
    const teamId = makeTeamId(index + 1);
    const name = row.querySelector(".team-name-input").value;
    const controlId = row.querySelector(".team-control-select").value;
    draft.teams[index] = { team_id: teamId, name, control_id: controlId };
  });

  draft = normalizeDraft(draft);
  enforceUniqueDraftControls();
  questionTimeEl.value = String(draft.question_time);
  saveDraft();
}

function enforceUniqueDraftControls() {
  const usedControls = new Set();
  draft.teams = draft.teams.map((team) => {
    if (!team.control_id) {
      return team;
    }

    if (usedControls.has(team.control_id)) {
      return { ...team, control_id: "" };
    }

    usedControls.add(team.control_id);
    return team;
  });
}

function getUsedControlsExcept(teamId) {
  const used = new Set();
  draft.teams.forEach((team) => {
    if (!team.control_id || team.team_id === teamId) {
      return;
    }
    used.add(team.control_id);
  });
  return used;
}

function buildControlOptions(selectEl, selectedValue = "", teamId = "") {
  selectEl.innerHTML = "";
  const usedByOtherTeams = getUsedControlsExcept(teamId);

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Selecciona un control";
  selectEl.appendChild(emptyOption);

  controls.forEach((control) => {
    const option = document.createElement("option");
    option.value = control.device_id;
    option.textContent = `${control.device_id} (${control.status})`;
    option.disabled = usedByOtherTeams.has(control.device_id);
    if (control.device_id === selectedValue) {
      option.selected = true;
      option.disabled = false;
    }
    selectEl.appendChild(option);
  });
}

function syncControlSelectOptions() {
  const selects = [...teamsFormEl.querySelectorAll(".team-control-select")];
  enforceUniqueDraftControls();
  selects.forEach((selectEl, index) => {
    const teamId = selectEl.dataset.teamId || makeTeamId(index + 1);
    const selectedValue = draft.teams[index]?.control_id || "";
    buildControlOptions(selectEl, selectedValue, teamId);
  });
}

function renderTeamRows() {
  if (teamsFormEl.querySelector(".team-row")) {
    syncDraftFromForm();
  }
  teamsFormEl.innerHTML = "";

  const totalTeams = Number(teamCountEl.value);
  draft.team_count = totalTeams;
  draft = normalizeDraft(draft);
  enforceUniqueDraftControls();
  for (let index = 0; index < totalTeams; index += 1) {
    const teamNumber = index + 1;
    const teamId = makeTeamId(teamNumber);
    const existingTeam = draft.teams.find((team) => team.team_id === teamId);

    const node = teamRowTemplate.content.cloneNode(true);
    node.querySelector(".team-row-title").textContent = `Equipo ${teamNumber}`;

    const nameInput = node.querySelector(".team-name-input");
    nameInput.value = existingTeam?.name || "";
    nameInput.dataset.teamId = teamId;
    nameInput.addEventListener("input", () => {
      const teamIndex = Number(nameInput.dataset.teamId.split("_")[1]) - 1;
      draft.teams[teamIndex].name = nameInput.value;
      saveDraft();
    });

    const controlSelect = node.querySelector(".team-control-select");
    controlSelect.dataset.teamId = teamId;
    buildControlOptions(controlSelect, existingTeam?.control_id || "", teamId);
    controlSelect.addEventListener("change", () => {
      const teamIndex = Number(controlSelect.dataset.teamId.split("_")[1]) - 1;
      draft.teams[teamIndex].control_id = controlSelect.value;
      enforceUniqueDraftControls();
      saveDraft();
      syncControlSelectOptions();
    });

    const testBtn = node.querySelector(".test-control-btn");
    testBtn.addEventListener("click", async () => {
      const deviceId = controlSelect.value;
      if (!deviceId) {
        setMessage("Selecciona un control antes de probarlo.", "error");
        return;
      }

      const response = await fetch(`/api/controls/${encodeURIComponent(deviceId)}/test`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.detail || "No se pudo probar el control.", "error");
        return;
      }

      setMessage(`Prueba enviada a ${deviceId}.`, "success");
    });

    teamsFormEl.appendChild(node);
  }

  saveDraft();
}

function collectPayload() {
  const teamRows = [...teamsFormEl.querySelectorAll(".team-row")];
  const teams = teamRows.map((row, index) => {
    const teamId = makeTeamId(index + 1);
    const name = row.querySelector(".team-name-input").value;
    const controlId = row.querySelector(".team-control-select").value;
    return {
      team_id: teamId,
      name,
      control_id: controlId,
    };
  });

  return {
    game_name: gameNameEl.value,
    question_time: clampQuestionTime(questionTimeEl.value),
    teams,
  };
}

async function saveGameConfig() {
  syncDraftFromForm();
  const payload = collectPayload();
  const response = await fetch("/api/game-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    setMessage(data.detail || "No se pudo guardar la configuracion.", "error");
    return;
  }

  const data = await response.json();
  currentConfig = data.game_config;
  draft = draftFromConfig(currentConfig);
  clearDraftStorage();
  setMessage("Configuracion guardada correctamente.", "success");
  renderTeamRows();
}

function renderQuestionsErrors(errors) {
  questionsErrorsEl.innerHTML = "";
  if (!errors || errors.length === 0) {
    return;
  }

  errors.forEach((error) => {
    const li = document.createElement("li");
    li.textContent = error;
    questionsErrorsEl.appendChild(li);
  });
}

function renderQuestionsPreview() {
  questionsPreviewBodyEl.innerHTML = "";

  if (!questionsLoaded || questionsPreview.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 10;
    cell.className = "list-empty";
    cell.textContent = "No hay preguntas cargadas.";
    row.appendChild(cell);
    questionsPreviewBodyEl.appendChild(row);
    return;
  }

  questionsPreview.slice(0, 20).forEach((question) => {
    const row = document.createElement("tr");
    const values = [
      question.question_id,
      question.text,
      question.option_a,
      question.option_b,
      question.option_c,
      question.option_d,
      question.correct_answer,
      question.points,
      question.category || "",
      question.difficulty || "",
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value ?? "");
      row.appendChild(cell);
    });

    questionsPreviewBodyEl.appendChild(row);
  });
}

function renderQuestionBankStatus() {
  questionsCounterEl.textContent = `Preguntas cargadas: ${totalQuestions}`;
  questionModeSelectEl.value = questionMode;
  renderQuestionsPreview();
}

async function uploadQuestionsFile() {
  const selectedFile = questionFileEl.files?.[0];
  if (!selectedFile) {
    setQuestionsMessage("Selecciona un archivo antes de cargar.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", selectedFile);

  uploadQuestionsBtnEl.disabled = true;
  setQuestionsMessage("Cargando archivo de preguntas...", "info");
  renderQuestionsErrors([]);

  try {
    const response = await fetch("/api/questions/upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      const errors = data.errors || [data.detail || "El archivo no es valido"];
      setQuestionsMessage(data.message || "El archivo no es valido", "error");
      renderQuestionsErrors(errors);
      return;
    }

    questionsLoaded = true;
    totalQuestions = Number(data.total_questions || 0);
    questionsPreview = data.questions_preview || [];
    setQuestionsMessage(data.message || "Archivo cargado correctamente", "success");
    renderQuestionsErrors([]);
    renderQuestionBankStatus();
  } finally {
    uploadQuestionsBtnEl.disabled = false;
  }
}

async function saveQuestionMode() {
  const mode = questionModeSelectEl.value;
  const response = await fetch("/api/questions/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question_mode: mode }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    setQuestionsMessage(data.detail || data.message || "No se pudo actualizar el modo", "error");
    questionModeSelectEl.value = questionMode;
    return;
  }

  questionMode = data.question_mode;
  setQuestionsMessage(data.message || "Modo de preguntas actualizado", "success");
}

async function loadInitialData() {
  const [controlsRes, configRes, questionsRes] = await Promise.all([
    fetch("/api/controls"),
    fetch("/api/game-config"),
    fetch("/api/questions"),
  ]);

  const controlsData = await controlsRes.json();
  const configData = await configRes.json();
  const questionsData = await questionsRes.json();

  controls = controlsData.controls || [];
  currentConfig = configData.game_config || null;
  questionMode = questionsData.question_mode || "ordered";
  totalQuestions = Number(questionsData.total_questions || 0);
  questionsLoaded = Boolean(questionsData.questions_loaded);
  questionsPreview = questionsData.questions || [];

  const storedDraft = loadDraftFromStorage();
  draft = currentConfig ? draftFromConfig(currentConfig) : storedDraft || normalizeDraft(null);

  gameNameEl.value = draft.game_name;
  questionTimeEl.value = String(draft.question_time);
  teamCountEl.value = String(draft.team_count);

  renderDetectedControls();
  renderTeamRows();
  renderQuestionBankStatus();
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "controls_updated") {
      controls = message.data || [];
      renderDetectedControls();
      syncControlSelectOptions();
      return;
    }

    if (message.type === "game_config_updated") {
      currentConfig = message.data || null;
      if (currentConfig?.game_name) {
        draft = draftFromConfig(currentConfig);
        clearDraftStorage();
      } else {
        draft = normalizeDraft(draft);
        saveDraft();
      }
      gameNameEl.value = draft.game_name;
      questionTimeEl.value = String(draft.question_time);
      teamCountEl.value = String(draft.team_count);
      renderTeamRows();
      return;
    }

    if (message.type === "questions_updated") {
      const data = message.data || {};
      questionsLoaded = Boolean(data.questions_loaded);
      totalQuestions = Number(data.total_questions || 0);
      questionMode = data.question_mode || questionMode;
      questionsPreview = data.questions || [];
      renderQuestionBankStatus();
      return;
    }

    if (message.type === "questions_config_updated") {
      const data = message.data || {};
      if (data.question_mode) {
        questionMode = data.question_mode;
        questionModeSelectEl.value = questionMode;
      }
    }
  };

  socket.onclose = () => {
    setTimeout(connectWebSocket, 1000);
  };
}

teamCountEl.addEventListener("change", () => {
  syncDraftFromForm();
  renderTeamRows();
});

gameNameEl.addEventListener("input", () => {
  draft.game_name = gameNameEl.value;
  saveDraft();
});

questionTimeEl.addEventListener("change", () => {
  draft.question_time = clampQuestionTime(questionTimeEl.value);
  questionTimeEl.value = String(draft.question_time);
  saveDraft();
});

saveConfigBtn.addEventListener("click", async () => {
  await saveGameConfig();
});

uploadQuestionsBtnEl.addEventListener("click", async () => {
  await uploadQuestionsFile();
});

questionModeSelectEl.addEventListener("change", async () => {
  await saveQuestionMode();
});

loadInitialData().catch((error) => {
  console.error("Error loading setup data", error);
  setMessage("No se pudo cargar datos iniciales.", "error");
});
connectWebSocket();
