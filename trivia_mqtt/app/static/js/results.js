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

async function loadResults() {
  try {
    const response = await fetch("/api/results");
    const data = await response.json();

    gameNameEl.textContent = data.game_name || "Sin nombre";

    const ranking = data.final_ranking || [];
    if (ranking.length > 0) {
      winnerNameEl.textContent = ranking[0].team_name;
      maxScoreEl.innerHTML = `${ranking[0].score} <span class="unit">pts</span>`;
    } else {
      winnerNameEl.textContent = "-";
      maxScoreEl.innerHTML = `0 <span class="unit">pts</span>`;
    }

    totalQuestionsEl.textContent = data.questions?.total || 0;
    totalPressesEl.textContent = data.presses?.total || 0;

    if (ranking.length === 0) {
      rankingTableEl.innerHTML = "<tr><td colspan='7'>No hay resultados disponibles</td></tr>";
    } else {
      rankingTableEl.innerHTML = ranking
        .map(
          (team) => `
          <tr>
            <td><span class="position-badge ${team.position === 1 ? "gold" : team.position === 2 ? "silver" : team.position === 3 ? "bronze" : ""}">${team.position}</span></td>
            <td>${team.team_name}</td>
            <td>${team.score} pts</td>
            <td>${team.correct_answers}</td>
            <td>${team.incorrect_answers}</td>
            <td>${team.total_presses}</td>
            <td>${team.average_press_time}s</td>
          </tr>
        `
        ).join("");
    }

    const questions = data.questions?.items || [];
    if (questions.length === 0) {
      questionsTableEl.innerHTML = "<tr><td colspan='6'>No hay preguntas registradas</td></tr>";
    } else {
      questionsTableEl.innerHTML = questions
        .map(
          (q) => `
          <tr>
            <td>${q.question_id}</td>
            <td>${q.question_text ? q.question_text.substring(0, 50) + (q.question_text.length > 50 ? "..." : "") : "-"}</td>
            <td>${q.correct_answer || "-"}</td>
            <td>${q.points}</td>
            <td>${q.final_result || "-"}</td>
            <td>${q.answered_by_team_name || "-"}</td>
          </tr>
        `
        ).join("");
    }

    const answers = data.answers?.items || [];
    if (answers.length === 0) {
      answersTableEl.innerHTML = "<tr><td colspan='5'>No hay respuestas registradas</td></tr>";
    } else {
      answersTableEl.innerHTML = answers
        .map(
          (a) => `
          <tr>
            <td>${a.question_id}</td>
            <td>${a.team_name}</td>
            <td>${a.result}</td>
            <td>${a.points_awarded}</td>
            <td>${a.elapsed_time}s</td>
          </tr>
        `
        ).join("");
    }

    loadingEl.style.display = "none";
    contentEl.style.display = "block";
  } catch (error) {
    console.error("Error loading results:", error);
    loadingEl.textContent = "Error al cargar resultados";
  }
}

loadResults();

const resultsChannel = new BroadcastChannel("display_view_channel");
resultsChannel.onmessage = (event) => {
  const view = event.data?.view;
  if (view === "results") {
    window.location.href = "/results";
  } else if (view === "display") {
    window.location.href = "/display";
  }
};

window.addEventListener("storage", (event) => {
  if (event.key === "display_view") {
    const view = event.newValue;
    if (view === "results") {
      window.location.href = "/results";
    } else if (view === "display") {
      window.location.href = "/display";
    }
  }
});