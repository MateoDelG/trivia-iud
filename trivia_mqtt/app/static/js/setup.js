const gameNameEl = document.getElementById("game-name");
const questionTimeEl = document.getElementById("question-time");
const displayTitleEl = document.getElementById("display-title");
const displayThemeEl = document.getElementById("display-theme");
const teamCountEl = document.getElementById("team-count");
const detectedControlsEl = document.getElementById("detected-controls");
const teamsFormEl = document.getElementById("teams-form");
const saveConfigBtn = document.getElementById("save-config-btn");
const resetConfigBtn = document.getElementById("reset-config-btn");
const validationMessagesEl = document.getElementById("validation-messages");
const teamRowTemplate = document.getElementById("team-row-template");

const questionFileEl = document.getElementById("question-file");
const uploadQuestionsBtnEl = document.getElementById("upload-questions-btn");
const questionModeSelectEl = document.getElementById("question-mode-select");
const questionsCounterEl = document.getElementById("questions-counter");
const questionsUploadMessagesEl = document.getElementById("questions-upload-messages");
const questionsErrorsEl = document.getElementById("questions-errors");
const questionsPreviewBodyEl = document.getElementById("questions-preview-body");
const setupStatControlsEl = document.getElementById("setup-stat-controls");
const setupStatTeamsEl = document.getElementById("setup-stat-teams");
const setupStatQuestionsEl = document.getElementById("setup-stat-questions");
const setupStatTimeEl = document.getElementById("setup-stat-time");
const summaryGameNameEl = document.getElementById("summary-game-name");
const summaryDisplayTitleEl = document.getElementById("summary-display-title");
const summaryQuestionTimeEl = document.getElementById("summary-question-time");
const summaryThemeEl = document.getElementById("summary-theme");
const summaryTeamCountEl = document.getElementById("summary-team-count");
const summaryAssignedControlsEl = document.getElementById("summary-assigned-controls");
const summaryQuestionsLoadedEl = document.getElementById("summary-questions-loaded");
const summaryQuestionModeEl = document.getElementById("summary-question-mode");
const bankFileLoadedEl = document.getElementById("bank-file-loaded");
const bankTotalQuestionsEl = document.getElementById("bank-total-questions");
const bankQuestionModeEl = document.getElementById("bank-question-mode");
const bankStatusEl = document.getElementById("bank-status");

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
  visual_config: {
    display_title: "TriviaMQTT",
    theme: "dark",
  },
  team_count: 1,
  teams: [],
};

function setMessage(text, type = "info") {
  validationMessagesEl.textContent = text;
  validationMessagesEl.className = "setup-message";
  if (type === "error") validationMessagesEl.classList.add("setup-message-error");
  else if (type === "success") validationMessagesEl.classList.add("setup-message-success");
  else validationMessagesEl.classList.add("setup-message-info");
}

function setQuestionsMessage(text, type = "info") {
  questionsUploadMessagesEl.textContent = text;
  questionsUploadMessagesEl.className = "setup-message";
  if (type === "error") questionsUploadMessagesEl.classList.add("setup-message-error");
  else if (type === "success") questionsUploadMessagesEl.classList.add("setup-message-success");
  else questionsUploadMessagesEl.classList.add("setup-message-info");
}

function formatQuestionMode(mode) {
  if (mode === "random") return "Aleatorio";
  return "En orden";
}

function formatBooleanLabel(value) {
  return value ? "Si" : "No";
}

function renderSetupSummary() {
  const teamCount = Number(teamCountEl.value || draft.team_count || 1);
  const assignedControls = (draft.teams || []).filter((team) => Boolean(team.control_id)).length;
  const loadedLabel = formatBooleanLabel(questionsLoaded);
  const onlineControls = controls.filter((control) => String(control.status || "").toLowerCase() === "online").length;
  const themeMap = { dark: "Dark", neon: "Neon", classic: "Classic" };
  const selectedTheme = displayThemeEl.value || draft.visual_config?.theme || "dark";

  if (setupStatControlsEl) setupStatControlsEl.textContent = String(controls.length);
  const setupStatControlsMetaEl = document.getElementById("setup-stat-controls-meta");
  if (setupStatControlsMetaEl) setupStatControlsMetaEl.textContent = `En linea: ${onlineControls}`;
  if (setupStatTeamsEl) setupStatTeamsEl.textContent = String(teamCount);
  const setupStatTeamsMetaEl = document.getElementById("setup-stat-teams-meta");
  if (setupStatTeamsMetaEl) setupStatTeamsMetaEl.textContent = `${assignedControls}/${teamCount} listos`;
  if (setupStatQuestionsEl) setupStatQuestionsEl.textContent = String(totalQuestions || 0);
  const setupStatQuestionsMetaEl = document.getElementById("setup-stat-questions-meta");
  if (setupStatQuestionsMetaEl) setupStatQuestionsMetaEl.textContent = questionsLoaded ? "Archivo cargado" : "Sin archivo cargado";
  if (setupStatTimeEl) setupStatTimeEl.textContent = `${clampQuestionTime(questionTimeEl.value || draft.question_time)} s`;
  const setupStatTimeMetaEl = document.getElementById("setup-stat-time-meta");
  if (setupStatTimeMetaEl) setupStatTimeMetaEl.textContent = "Configurado";

  if (summaryGameNameEl) summaryGameNameEl.textContent = (gameNameEl.value || "-").trim() || "-";
  if (summaryDisplayTitleEl) summaryDisplayTitleEl.textContent = (displayTitleEl.value || "-").trim() || "-";
  if (summaryQuestionTimeEl) summaryQuestionTimeEl.textContent = `${clampQuestionTime(questionTimeEl.value || draft.question_time)} s`;
  if (summaryThemeEl) summaryThemeEl.textContent = themeMap[selectedTheme] || "Dark";
  if (summaryTeamCountEl) summaryTeamCountEl.textContent = String(teamCount);
  if (summaryAssignedControlsEl) summaryAssignedControlsEl.textContent = String(assignedControls);
  if (summaryQuestionsLoadedEl) summaryQuestionsLoadedEl.textContent = loadedLabel;
  if (summaryQuestionModeEl) summaryQuestionModeEl.textContent = formatQuestionMode(questionMode);

  if (bankFileLoadedEl) bankFileLoadedEl.textContent = loadedLabel;
  if (bankTotalQuestionsEl) bankTotalQuestionsEl.textContent = String(totalQuestions || 0);
  if (bankQuestionModeEl) bankQuestionModeEl.textContent = formatQuestionMode(questionMode);
  if (bankStatusEl) {
    if (!questionsLoaded) bankStatusEl.textContent = "Pendiente";
    else bankStatusEl.textContent = "Archivo cargado";
  }
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
    renderSetupSummary();
    return;
  }

  detectedControlsEl.className = "detected-controls-list";
  const assignedMap = new Map((draft.teams || []).filter((team) => team.control_id).map((team, index) => [team.control_id, `Equipo ${index + 1}`]));
  detectedControlsEl.innerHTML = controls
    .map((control) => {
      const status = String(control.status || "offline").toLowerCase();
      const onlineClass = status === "online" ? "online" : "";
      const assigned = assignedMap.get(control.device_id);
      return `<article class="detected-control-chip ${onlineClass}"><div class="detected-control-main"><span class="detected-control-id">${control.device_id}</span><span class="detected-control-sub">${status === "online" ? "En linea" : "Desconectado"}</span></div>${assigned ? `<span class="detected-control-assigned">Asignado a: ${assigned}</span>` : ""}</article>`;
    })
    .join("");
  renderSetupSummary();
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
    visual_config: {
      display_title: String(raw?.visual_config?.display_title || raw?.game_name || "TriviaMQTT").trim() || "TriviaMQTT",
      theme: ["dark", "neon", "classic"].includes(raw?.visual_config?.theme) ? raw.visual_config.theme : "dark",
    },
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
    visual_config: {
      display_title: config.visual_config?.display_title || config.game_name || "TriviaMQTT",
      theme: config.visual_config?.theme || "dark",
    },
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
  draft.visual_config = {
    display_title: (displayTitleEl.value || "").trim() || gameNameEl.value || "TriviaMQTT",
    theme: displayThemeEl.value,
  };
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
  renderSetupSummary();
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
    const statusBadge = node.querySelector(".team-status-badge");
    const selectedControl = controls.find((control) => control.device_id === (existingTeam?.control_id || ""));
    if (selectedControl) {
      const isOnline = String(selectedControl.status || "").toLowerCase() === "online";
      statusBadge.textContent = isOnline ? "Control en linea" : "Control offline";
      statusBadge.classList.toggle("online", isOnline);
    }
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
  renderSetupSummary();
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
    visual_config: {
      display_title: (displayTitleEl.value || "").trim() || gameNameEl.value || "TriviaMQTT",
      theme: displayThemeEl.value,
    },
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
  displayTitleEl.value = draft.visual_config.display_title;
  displayThemeEl.value = draft.visual_config.theme;
  setMessage("Configuracion guardada correctamente.", "success");
  renderTeamRows();
  renderSetupSummary();
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
    cell.colSpan = 11;
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
      question.explanation || question.feedback || "",
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
  renderSetupSummary();
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
  displayTitleEl.value = draft.visual_config.display_title;
  displayThemeEl.value = draft.visual_config.theme;
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
      displayTitleEl.value = draft.visual_config.display_title;
      displayThemeEl.value = draft.visual_config.theme;
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
  renderSetupSummary();
});

questionTimeEl.addEventListener("change", () => {
  draft.question_time = clampQuestionTime(questionTimeEl.value);
  questionTimeEl.value = String(draft.question_time);
  saveDraft();
  renderSetupSummary();
});

displayTitleEl.addEventListener("input", () => {
  draft.visual_config.display_title = (displayTitleEl.value || "").trim() || "TriviaMQTT";
  saveDraft();
  renderSetupSummary();
});

displayThemeEl.addEventListener("change", () => {
  draft.visual_config.theme = displayThemeEl.value;
  saveDraft();
  renderSetupSummary();
});

saveConfigBtn.addEventListener("click", async () => {
  await saveGameConfig();
});

if (resetConfigBtn) {
  resetConfigBtn.addEventListener("click", () => {
    draft = currentConfig ? draftFromConfig(currentConfig) : normalizeDraft(null);
    gameNameEl.value = draft.game_name;
    questionTimeEl.value = String(draft.question_time);
    displayTitleEl.value = draft.visual_config.display_title;
    displayThemeEl.value = draft.visual_config.theme;
    teamCountEl.value = String(draft.team_count);
    renderTeamRows();
    renderDetectedControls();
    setMessage("Formulario restablecido.", "info");
  });
}

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
