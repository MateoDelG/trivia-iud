const loadingEl = document.getElementById("loading");
const contentEl = document.getElementById("results-content");
const gameNameEl = document.getElementById("game-name");
const winnerNameEl = document.getElementById("winner-name");
const maxScoreEl = document.getElementById("max-score");
const totalQuestionsEl = document.getElementById("total-questions");
const totalPressesEl = document.getElementById("total-presses");
const rankingTableEl = document.getElementById("ranking-table");
const questionsTableEl = document.getElementById("questions-table");
const answersTableEl = document.getElementById("answers-table");
const persistedStatusCardEl = document.getElementById("persisted-status-card");
const persistedStatusMessageEl = document.getElementById("persisted-status-message");
const persistedStatusDetailEl = document.getElementById("persisted-status-detail");
const perfTeamMaxScoreEl = document.getElementById("perf-team-max-score");
const perfTeamAvgTimeEl = document.getElementById("perf-team-avg-time");

function formatTeamName(name) {
  return name && String(name).trim() ? String(name).trim() : "Sin equipo";
}

function formatResultLabel(result) {
  const key = String(result || "").toLowerCase();
  if (key === "correct") return "correct";
  if (key === "incorrect") return "incorrect";
  if (key === "unanswered") return "unanswered";
  return key || "-";
}

function formatSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  return `${seconds.toFixed(2)} s`;
}

function resultBadge(result) {
  const label = formatResultLabel(result);
  const safeClass = ["correct", "incorrect", "unanswered"].includes(label) ? label : "unanswered";
  return `<span class="result-badge ${safeClass}">${label}</span>`;
}

function renderTeamMetricList(container, teams, valueFormatter) {
  if (!container || !teams) return;
  if (!teams.length) {
    container.innerHTML = "<div class='perf-team-empty'>Sin datos disponibles</div>";
    return;
  }
  container.innerHTML = teams
    .map(
      (team) =>
        `<div class="perf-team-row"><span>${formatTeamName(team.team_name)}</span><strong>${valueFormatter(team)}</strong></div>`
    )
    .join("");
}

async function loadResults() {
  try {
    const response = await fetch("/api/results");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();

    gameNameEl.textContent = data.game_name || "Sin nombre";

    const ranking = data.final_ranking || [];
    if (ranking.length > 0) {
      winnerNameEl.textContent = formatTeamName(ranking[0].team_name);
      maxScoreEl.innerHTML = `${ranking[0].score} <span class="unit">pts</span>`;
    } else {
      winnerNameEl.textContent = "-";
      maxScoreEl.innerHTML = `0 <span class="unit">pts</span>`;
    }

    totalQuestionsEl.textContent = data.questions?.total || 0;
    totalPressesEl.textContent = data.presses?.total || 0;

    const gameUid = data.game_uid || null;
    const isPersisted = Boolean(data.is_persisted);
    persistedStatusCardEl.style.display = "grid";
    if (isPersisted && gameUid) {
      persistedStatusMessageEl.textContent = "Partida guardada en SQLite";
      persistedStatusDetailEl.textContent = `game_uid: ${gameUid}`;
    } else {
      persistedStatusMessageEl.textContent = "Partida aun no guardada en SQLite";
      persistedStatusDetailEl.textContent = "game_uid: pendiente";
    }

    if (ranking.length === 0) {
      rankingTableEl.innerHTML = "<tr><td colspan='7'>No hay resultados disponibles</td></tr>";
    } else {
      rankingTableEl.innerHTML = ranking
        .map(
          (team) => `
          <tr>
            <td><span class="position-badge ${team.position === 1 ? "gold" : team.position === 2 ? "silver" : team.position === 3 ? "bronze" : ""}">${team.position}</span></td>
            <td>${formatTeamName(team.team_name)}</td>
            <td>${team.score} pts</td>
            <td>${team.correct_answers}</td>
            <td>${team.incorrect_answers}</td>
            <td>${team.total_presses}</td>
            <td>${formatSeconds(team.average_press_time)}</td>
          </tr>
        `
        ).join("");
    }

    const questions = data.questions?.items || [];
    if (questionsTableEl && questions.length === 0) {
      questionsTableEl.innerHTML = "<tr><td colspan='6'>No hay preguntas registradas</td></tr>";
    } else if (questionsTableEl && questions.length > 0) {
      questionsTableEl.innerHTML = questions
        .map(
          (q) => `
          <tr>
            <td>${q.question_id}</td>
            <td>${q.question_text ? q.question_text.substring(0, 50) + (q.question_text.length > 50 ? "..." : "") : "-"}</td>
            <td>${q.correct_answer || "-"}</td>
            <td>${q.points}</td>
            <td>${resultBadge(q.final_result)}</td>
            <td>${formatTeamName(q.answered_by_team_name)}</td>
          </tr>
        `
        ).join("");
    }

    const answers = data.answers?.items || [];
    if (answersTableEl && answers.length === 0) {
      answersTableEl.innerHTML = "<tr><td colspan='5'>No hay respuestas registradas</td></tr>";
    } else if (answersTableEl && answers.length > 0) {
      answersTableEl.innerHTML = answers
        .map(
          (a) => `
          <tr>
            <td>${a.question_id}</td>
            <td>${formatTeamName(a.team_name)}</td>
            <td>${resultBadge(a.result)}</td>
            <td>${a.points_awarded}</td>
            <td>${formatSeconds(a.elapsed_time)}</td>
          </tr>
        `
        ).join("");
    }

    renderTeamMetricList(perfTeamMaxScoreEl, ranking || [], (team) => `${Number(team.score || 0)} pts`);
    renderTeamMetricList(perfTeamAvgTimeEl, ranking || [], (team) => formatSeconds(team.average_press_time));

    loadingEl.style.display = "none";
    contentEl.style.display = "block";
  } catch (error) {
    console.error("Error loading results:", error);
    loadingEl.textContent = "Error al cargar resultados: " + error.message;
  }
}

loadResults();

window.addEventListener("storage", (event) => {
  if (event.key !== "display_view" || !event.newValue) return;
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
