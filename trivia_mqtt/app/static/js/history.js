const gamesBodyEl = document.getElementById("history-games-body");
const detailSectionEl = document.getElementById("history-detail");
const detailTitleEl = document.getElementById("history-detail-title");
const detailSummaryEl = document.getElementById("history-detail-summary");
const teamsEl = document.getElementById("history-teams");
const questionsEl = document.getElementById("history-questions");
const answersEl = document.getElementById("history-answers");
const pressesEl = document.getElementById("history-presses");

function fmt(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function renderList(el, rows, formatter) {
  if (!rows || rows.length === 0) {
    el.className = "list-empty";
    el.textContent = "Sin datos.";
    return;
  }

  el.className = "history-list";
  el.innerHTML = rows.map(formatter).join("<br />");
}

async function loadGames() {
  try {
    const response = await fetch("/api/history/games");
    const data = await response.json();
    const games = data.games || [];

    if (games.length === 0) {
      gamesBodyEl.innerHTML = "<tr><td colspan='6' class='list-empty'>No hay partidas guardadas.</td></tr>";
      return;
    }

    gamesBodyEl.innerHTML = games
      .map(
        (game) => `
        <tr>
          <td>${game.game_name || "-"}<br /><small>${game.game_uid}</small></td>
          <td>${fmt(game.started_at)}</td>
          <td>${fmt(game.finished_at)}</td>
          <td>${game.total_questions ?? 0}</td>
          <td>${game.winner_team_name || "-"}</td>
          <td>
            <div class="history-actions">
              <button class="btn btn-secondary" data-action="view" data-uid="${game.game_uid}">Ver detalle</button>
              <a class="btn btn-secondary" href="/api/history/games/${encodeURIComponent(game.game_uid)}/export/full.xlsx">Excel</a>
              <button class="btn btn-danger" data-action="delete" data-uid="${game.game_uid}">Eliminar</button>
            </div>
          </td>
        </tr>
      `
      )
      .join("");
  } catch (error) {
    gamesBodyEl.innerHTML = `<tr><td colspan='6' class='message-error'>Error cargando historial: ${error}</td></tr>`;
  }
}

async function loadDetail(gameUid) {
  const response = await fetch(`/api/history/games/${encodeURIComponent(gameUid)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "No se pudo cargar detalle");
  }

  detailSectionEl.classList.remove("hidden");
  detailTitleEl.textContent = `Detalle: ${data.game.game_name || gameUid}`;
  detailSummaryEl.textContent = `Inicio: ${fmt(data.game.started_at)} | Fin: ${fmt(data.game.finished_at)} | Ganador: ${
    data.game.winner_team_name || "-"
  }`;

  renderList(teamsEl, data.teams || [], (item) => `${item.position}. ${item.team_name} - ${item.score} pts`);
  renderList(
    questionsEl,
    data.questions || [],
    (item) => `Q${item.question_id}: ${item.question_text} (${item.final_result || "-"})`
  );
  renderList(
    answersEl,
    data.answers || [],
    (item) => `${item.team_name} - ${item.result} (${item.points_awarded} pts, ${item.elapsed_time}s)`
  );
  renderList(
    pressesEl,
    data.presses || [],
    (item) => `${item.press_order}. ${item.team_name} - ${item.elapsed_time}s (${item.question_id})`
  );
}

async function deleteGame(gameUid) {
  const accepted = window.confirm("Esta accion eliminara la partida historica. Deseas continuar?");
  if (!accepted) return;

  const response = await fetch(`/api/history/games/${encodeURIComponent(gameUid)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert(data.detail || "No se pudo eliminar la partida");
    return;
  }

  if (detailTitleEl.textContent.includes(gameUid)) {
    detailSectionEl.classList.add("hidden");
  }
  await loadGames();
}

gamesBodyEl.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const gameUid = target.dataset.uid;
  if (!gameUid) return;

  try {
    if (action === "view") {
      await loadDetail(gameUid);
      return;
    }
    if (action === "delete") {
      await deleteGame(gameUid);
    }
  } catch (error) {
    window.alert(`Error: ${error}`);
  }
});

loadGames();
