"""SQLite persistence for trivia history."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from openpyxl import Workbook

from app.path_utils import data_dir

DB_PATH = data_dir() / "database" / "trivia.db"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_uid TEXT UNIQUE,
                game_name TEXT,
                question_mode TEXT,
                question_time INTEGER,
                started_at TEXT,
                finished_at TEXT,
                total_questions INTEGER,
                winner_team_name TEXT,
                created_at TEXT
            );

CREATE TABLE IF NOT EXISTS teams (
                game_uid TEXT,
                team_id TEXT,
                team_name TEXT,
                control_id TEXT,
                score INTEGER,
                correct_answers INTEGER,
                incorrect_answers INTEGER,
                total_presses INTEGER,
                total_response_time REAL,
                position INTEGER
            );

            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_uid TEXT,
                question_id TEXT,
                question_text TEXT,
                option_a TEXT,
                option_b TEXT,
                option_c TEXT,
                option_d TEXT,
                correct_answer TEXT,
                points INTEGER,
                category TEXT,
                difficulty TEXT,
                feedback TEXT,
                final_result TEXT,
                answered_by_team_id TEXT,
                answered_by_team_name TEXT,
                points_awarded INTEGER,
                started_at TEXT,
                finished_at TEXT
            );

            CREATE TABLE IF NOT EXISTS answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_uid TEXT,
                question_id TEXT,
                team_id TEXT,
                team_name TEXT,
                control_id TEXT,
                result TEXT,
                points_awarded INTEGER,
                elapsed_time REAL,
                timestamp TEXT
            );

            CREATE TABLE IF NOT EXISTS presses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_uid TEXT,
                question_id TEXT,
                team_id TEXT,
                team_name TEXT,
                control_id TEXT,
                elapsed_time REAL,
                press_order INTEGER,
                timestamp TEXT
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_uid TEXT,
                timestamp TEXT,
                event_type TEXT,
                description TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS score_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_uid TEXT,
                timestamp TEXT,
                team_id TEXT,
                team_name TEXT,
                previous_score INTEGER,
                delta INTEGER,
                new_score INTEGER,
                reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_games_uid ON games(game_uid);
            CREATE INDEX IF NOT EXISTS idx_teams_uid ON teams(game_uid);
            CREATE INDEX IF NOT EXISTS idx_questions_uid ON questions(game_uid);
            CREATE INDEX IF NOT EXISTS idx_answers_uid ON answers(game_uid);
            CREATE INDEX IF NOT EXISTS idx_presses_uid ON presses(game_uid);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_unique ON questions(game_uid, question_id);
            """
        )
        team_columns = {
            row[1]
            for row in conn.execute("PRAGMA table_info(teams)").fetchall()
        }
        if "total_response_time" not in team_columns:
            conn.execute("ALTER TABLE teams ADD COLUMN total_response_time REAL")
            if "average_press_time" in team_columns:
                conn.execute(
                    "UPDATE teams SET total_response_time = average_press_time WHERE total_response_time IS NULL"
                )


def upsert_game_start(
    *,
    game_uid: str,
    game_name: str,
    question_mode: str,
    question_time: int,
    started_at: str | None,
    total_questions: int,
) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO games (
                game_uid, game_name, question_mode, question_time, started_at,
                total_questions, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_uid) DO UPDATE SET
                game_name = excluded.game_name,
                question_mode = excluded.question_mode,
                question_time = excluded.question_time,
                started_at = COALESCE(games.started_at, excluded.started_at),
                total_questions = excluded.total_questions
            """,
            (
                game_uid,
                game_name,
                question_mode,
                question_time,
                started_at,
                total_questions,
                _now_iso(),
            ),
        )


def upsert_teams_snapshot(game_uid: str, teams: list[dict[str, Any]]) -> None:
    with _connect() as conn:
        conn.execute("DELETE FROM teams WHERE game_uid = ?", (game_uid,))
        conn.executemany(
            """
            INSERT INTO teams (
                game_uid, team_id, team_name, control_id, score,
                correct_answers, incorrect_answers, total_presses,
                total_response_time, position
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    game_uid,
                    team.get("team_id"),
                    team.get("team_name"),
                    team.get("control_id"),
                    int(team.get("score", 0) or 0),
                    int(team.get("correct_answers", 0) or 0),
                    int(team.get("incorrect_answers", 0) or 0),
                    int(team.get("total_presses", 0) or 0),
                    float(team.get("total_response_time", 0.0) or 0.0),
                    int(team.get("position", 0) or 0),
                )
                for team in teams
            ],
        )


def upsert_question_start(game_uid: str, question: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO questions (
                game_uid, question_id, question_text, option_a, option_b, option_c,
                option_d, correct_answer, points, category, difficulty, feedback,
                started_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_uid, question_id) DO UPDATE SET
                question_text = excluded.question_text,
                option_a = excluded.option_a,
                option_b = excluded.option_b,
                option_c = excluded.option_c,
                option_d = excluded.option_d,
                correct_answer = excluded.correct_answer,
                points = excluded.points,
                category = excluded.category,
                difficulty = excluded.difficulty,
                feedback = excluded.feedback,
                started_at = COALESCE(questions.started_at, excluded.started_at)
            """,
            (
                game_uid,
                question.get("question_id"),
                question.get("question_text"),
                question.get("option_a"),
                question.get("option_b"),
                question.get("option_c"),
                question.get("option_d"),
                question.get("correct_answer"),
                int(question.get("points", 0) or 0),
                question.get("category"),
                question.get("difficulty"),
                question.get("feedback"),
                question.get("started_at"),
            ),
        )


def update_question_result(game_uid: str, question: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """
            UPDATE questions
            SET final_result = ?,
                answered_by_team_id = ?,
                answered_by_team_name = ?,
                points_awarded = ?,
                finished_at = ?
            WHERE game_uid = ? AND question_id = ?
            """,
            (
                question.get("final_result"),
                question.get("answered_by_team_id"),
                question.get("answered_by_team_name"),
                int(question.get("points_awarded", 0) or 0),
                question.get("finished_at"),
                game_uid,
                question.get("question_id"),
            ),
        )


def insert_answer(game_uid: str, answer: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO answers (
                game_uid, question_id, team_id, team_name, control_id,
                result, points_awarded, elapsed_time, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                game_uid,
                answer.get("question_id"),
                answer.get("team_id"),
                answer.get("team_name"),
                answer.get("control_id"),
                answer.get("result"),
                int(answer.get("points_awarded", 0) or 0),
                float(answer.get("elapsed_time", 0.0) or 0.0),
                answer.get("timestamp"),
            ),
        )


def insert_press(game_uid: str, press: dict[str, Any]) -> None:
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO presses (
                game_uid, question_id, team_id, team_name, control_id,
                elapsed_time, press_order, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                game_uid,
                press.get("question_id"),
                press.get("team_id"),
                press.get("team_name"),
                press.get("control_id"),
                float(press.get("elapsed_time", 0.0) or 0.0),
                int(press.get("press_order", 0) or 0),
                press.get("timestamp"),
            ),
        )


def finalize_game(
    *,
    game_uid: str,
    finished_at: str | None,
    total_questions: int,
    winner_team_name: str | None,
) -> None:
    with _connect() as conn:
        conn.execute(
            """
            UPDATE games
            SET finished_at = ?,
                total_questions = ?,
                winner_team_name = ?
            WHERE game_uid = ?
            """,
            (finished_at, total_questions, winner_team_name, game_uid),
        )


def save_completed_game(payload: dict[str, Any]) -> bool:
    game_uid = str(payload.get("game_uid") or "").strip()
    game = payload.get("game") or {}
    if not game_uid or not game:
        raise ValueError("game_uid and game are required")

    upsert_game_start(
        game_uid=game_uid,
        game_name=game.get("game_name") or "Sin nombre",
        question_mode=game.get("question_mode") or "ordered",
        question_time=int(game.get("question_time", 20) or 20),
        started_at=game.get("started_at"),
        total_questions=int(game.get("total_questions", 0) or 0),
    )

    teams = payload.get("teams") or []
    upsert_teams_snapshot(game_uid, teams)

    for question in payload.get("questions") or []:
        upsert_question_start(
            game_uid,
            {
                "question_id": question.get("question_id"),
                "question_text": question.get("question_text"),
                "option_a": question.get("option_a"),
                "option_b": question.get("option_b"),
                "option_c": question.get("option_c"),
                "option_d": question.get("option_d"),
                "correct_answer": question.get("correct_answer"),
                "points": question.get("points", 0),
                "category": question.get("category"),
                "difficulty": question.get("difficulty"),
                "feedback": question.get("feedback"),
                "started_at": question.get("started_at"),
            },
        )
        update_question_result(
            game_uid,
            {
                "question_id": question.get("question_id"),
                "final_result": question.get("final_result"),
                "answered_by_team_id": question.get("answered_by_team_id"),
                "answered_by_team_name": question.get("answered_by_team_name"),
                "points_awarded": question.get("points_awarded", 0),
                "finished_at": question.get("finished_at"),
            },
        )

    for answer in payload.get("answers") or []:
        insert_answer(game_uid, answer)
    for press in payload.get("presses") or []:
        insert_press(game_uid, press)

    finalize_game(
        game_uid=game_uid,
        finished_at=game.get("finished_at"),
        total_questions=int(game.get("total_questions", 0) or 0),
        winner_team_name=game.get("winner_team_name"),
    )
    return True


def _rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def list_games() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT game_uid, game_name, started_at, finished_at,
                   total_questions, winner_team_name
            FROM games
            ORDER BY finished_at DESC, created_at DESC
            """
        ).fetchall()
    return _rows_to_dicts(rows)


def get_game_detail(game_uid: str) -> dict[str, Any] | None:
    with _connect() as conn:
        game = conn.execute("SELECT * FROM games WHERE game_uid = ?", (game_uid,)).fetchone()
        if not game:
            return None

        teams = conn.execute("SELECT * FROM teams WHERE game_uid = ? ORDER BY position ASC", (game_uid,)).fetchall()
        questions = conn.execute("SELECT * FROM questions WHERE game_uid = ? ORDER BY id ASC", (game_uid,)).fetchall()
        answers = conn.execute("SELECT * FROM answers WHERE game_uid = ? ORDER BY id ASC", (game_uid,)).fetchall()
        presses = conn.execute("SELECT * FROM presses WHERE game_uid = ? ORDER BY id ASC", (game_uid,)).fetchall()

    return {
        "game": dict(game),
        "teams": _rows_to_dicts(teams),
        "questions": _rows_to_dicts(questions),
        "answers": _rows_to_dicts(answers),
        "presses": _rows_to_dicts(presses),
        "events": [],
        "score_adjustments": [],
    }


def delete_game(game_uid: str) -> bool:
    with _connect() as conn:
        exists = conn.execute("SELECT 1 FROM games WHERE game_uid = ?", (game_uid,)).fetchone()
        if not exists:
            return False

        conn.execute("DELETE FROM teams WHERE game_uid = ?", (game_uid,))
        conn.execute("DELETE FROM questions WHERE game_uid = ?", (game_uid,))
        conn.execute("DELETE FROM answers WHERE game_uid = ?", (game_uid,))
        conn.execute("DELETE FROM presses WHERE game_uid = ?", (game_uid,))
        conn.execute("DELETE FROM events WHERE game_uid = ?", (game_uid,))
        conn.execute("DELETE FROM score_adjustments WHERE game_uid = ?", (game_uid,))
        conn.execute("DELETE FROM games WHERE game_uid = ?", (game_uid,))
    return True


def export_game_xlsx(game_uid: str) -> bytes:
    detail = get_game_detail(game_uid)
    if detail is None:
        raise ValueError("Partida no encontrada")

    wb = Workbook()
    sheets = {
        "Resumen": [detail["game"]],
        "Equipos": detail["teams"],
        "Preguntas": detail["questions"],
        "Respuestas": detail["answers"],
        "Pulsaciones": detail["presses"],
    }

    first_sheet = True
    for sheet_name, rows in sheets.items():
        ws = wb.active if first_sheet else wb.create_sheet(title=sheet_name)
        ws.title = sheet_name
        first_sheet = False

        if not rows:
            ws.append(["Sin datos"])
            continue

        headers = list(rows[0].keys())
        ws.append(headers)
        for row in rows:
            ws.append([row.get(header) for header in headers])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return stream.read()
