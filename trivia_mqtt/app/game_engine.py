"""Core game runtime and flow orchestration."""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import HTTPException

from app.database import (
    finalize_game as finalize_game_db,
    insert_answer,
    insert_press,
    update_question_result,
    upsert_game_start,
    upsert_question_start,
    upsert_teams_snapshot,
)
from app.models import AnswerRecord, ButtonPress, EventRecord, PressRecord, QuestionRecord
from app.state import app_state
from app.websocket_manager import ws_manager


class GameEngine:
    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._timer_task: Optional[asyncio.Task] = None
        self._led_sender: Optional[Callable[[str, str], None]] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def set_led_sender(self, led_sender: Callable[[str, str], None]) -> None:
        self._led_sender = led_sender

    def _disconnected_assigned_controls(self) -> list[tuple[str, str]]:
        teams = app_state.teams()
        controls = app_state.controls()
        controls_by_id = {control.device_id: str(control.status).lower() for control in controls}

        disconnected: list[tuple[str, str]] = []
        for team in teams:
            status = controls_by_id.get(team.control_id)
            if status != "online":
                disconnected.append((team.control_id, team.name))
        return disconnected

    def _assert_assigned_controls_online(self) -> None:
        disconnected = self._disconnected_assigned_controls()
        if not disconnected:
            return

        control_id, team_name = disconnected[0]
        raise HTTPException(
            status_code=400,
            detail=f"Accion bloqueada: control desconectado ({control_id} / {team_name})",
        )

    def _ranked_teams_snapshot(self) -> list[dict]:
        ranking = app_state.finalize_game() if app_state.game_status() == "game_finished" else []
        if ranking:
            return [item.model_dump() for item in ranking]

        teams = app_state.teams()
        sorted_teams = sorted(
            teams,
            key=lambda item: (-item.score, -item.correct_answers, item.incorrect_answers, item.name.lower()),
        )
        return [
            {
                "position": index + 1,
                "team_id": team.team_id,
                "team_name": team.name,
                "control_id": team.control_id,
                "score": team.score,
                "correct_answers": team.correct_answers,
                "incorrect_answers": team.incorrect_answers,
                "total_presses": team.total_presses,
                "average_press_time": 0.0,
            }
            for index, team in enumerate(sorted_teams)
        ]

    def _persist_game_start(self) -> str | None:
        game_uid = app_state.game_uid()
        config = app_state.game_config()
        if not game_uid or config is None:
            return "No hay game_uid/configuracion para persistir"

        try:
            upsert_game_start(
                game_uid=game_uid,
                game_name=config.game_name,
                question_mode=config.question_mode,
                question_time=config.question_time,
                started_at=app_state.game_started_at().isoformat() if app_state.game_started_at() else None,
                total_questions=app_state.prepared_questions_total(),
            )
            upsert_teams_snapshot(game_uid, self._ranked_teams_snapshot())
            app_state.mark_persisted(True)
            return None
        except Exception as exc:
            app_state.mark_persisted(False)
            return str(exc)

    def _persist_question_started(self) -> str | None:
        game_uid = app_state.game_uid()
        question = app_state.current_question()
        if not game_uid or question is None:
            return "No hay game_uid/pregunta para persistir"

        try:
            upsert_question_start(
                game_uid,
                {
                    "question_id": question.question_id,
                    "question_text": question.text,
                    "option_a": question.option_a,
                    "option_b": question.option_b,
                    "option_c": question.option_c,
                    "option_d": question.option_d,
                    "correct_answer": question.correct_answer,
                    "points": question.points,
                    "category": question.category,
                    "difficulty": question.difficulty,
                    "feedback": question.explanation or question.feedback,
                    "started_at": app_state.question_started_at().isoformat() if app_state.question_started_at() else None,
                },
            )
            return None
        except Exception as exc:
            app_state.mark_persisted(False)
            return str(exc)

    def _persist_press_record(self, record: PressRecord) -> None:
        game_uid = app_state.game_uid()
        if not game_uid:
            return
        try:
            insert_press(
                game_uid,
                {
                    "question_id": record.question_id,
                    "team_id": record.team_id,
                    "team_name": record.team_name,
                    "control_id": record.control_id,
                    "elapsed_time": record.elapsed_time,
                    "press_order": record.press_order,
                    "timestamp": record.timestamp.isoformat() if record.timestamp else None,
                },
            )
        except Exception:
            app_state.mark_persisted(False)

    def _persist_answer_record(self, record: AnswerRecord) -> None:
        game_uid = app_state.game_uid()
        if not game_uid:
            return
        try:
            insert_answer(
                game_uid,
                {
                    "question_id": record.question_id,
                    "team_id": record.team_id,
                    "team_name": record.team_name,
                    "control_id": record.control_id,
                    "result": record.result,
                    "points_awarded": record.points_awarded,
                    "elapsed_time": record.elapsed_time,
                    "timestamp": record.timestamp.isoformat() if record.timestamp else None,
                },
            )
        except Exception:
            app_state.mark_persisted(False)

    def _persist_question_result(self, record: QuestionRecord) -> None:
        game_uid = app_state.game_uid()
        if not game_uid:
            return
        try:
            update_question_result(
                game_uid,
                {
                    "question_id": record.question_id,
                    "final_result": record.final_result,
                    "answered_by_team_id": record.answered_by_team_id,
                    "answered_by_team_name": record.answered_by_team_name,
                    "points_awarded": record.points_awarded,
                    "finished_at": record.finished_at.isoformat() if record.finished_at else None,
                },
            )
            upsert_teams_snapshot(game_uid, self._ranked_teams_snapshot())
        except Exception:
            app_state.mark_persisted(False)

    async def start_game(self) -> dict:
        config = app_state.game_config()
        if config is None:
            raise HTTPException(status_code=400, detail="No hay configuracion de partida")
        if len(config.teams) == 0:
            raise HTTPException(status_code=400, detail="No hay equipos configurados")
        if not app_state.questions_loaded():
            raise HTTPException(status_code=400, detail="No hay preguntas cargadas")
        if config.question_mode not in {"ordered", "random"}:
            raise HTTPException(status_code=400, detail="question_mode debe ser ordered o random")
        if config.question_time <= 0:
            raise HTTPException(status_code=400, detail="question_time invalido")

        prepared_questions = app_state.questions()
        if config.question_mode == "random":
            random.shuffle(prepared_questions)

        await self._cancel_timer()
        app_state.prepare_game(prepared_questions)
        persistence_error = self._persist_game_start()

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="game_started",
            topic="internal/game/start",
            payload={"total_questions": len(prepared_questions), "question_mode": config.question_mode},
            message="Partida iniciada",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

        return {
            "success": True,
            "message": "Partida iniciada",
            "game_status": app_state.game_status(),
            "total_questions": len(prepared_questions),
            "game_uid": app_state.game_uid(),
            "is_persisted": app_state.is_persisted(),
            "persistence_error": persistence_error,
        }

    async def start_next_question(self) -> dict:
        if app_state.game_status() in {"question_ready", "question_active", "waiting_for_answer"}:
            raise HTTPException(status_code=400, detail="Ya hay una pregunta en curso")
        if app_state.game_status() not in {"game_running", "question_finished"}:
            raise HTTPException(status_code=400, detail="La partida no esta iniciada")

        question = app_state.start_next_question()
        if question is None:
            return await self.end_game(message="Partida finalizada: no hay mas preguntas")

        persistence_error = self._persist_question_started()

        await self._cancel_timer()

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="question_ready",
            topic="internal/game/question/start",
            payload={
                "question_index": app_state.current_question_index(),
                "question_id": question.question_id,
            },
            message=f"Pregunta lista ({app_state.current_question_index() + 1}). Inicia el temporizador.",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

        return {
            "success": True,
            "message": "Pregunta preparada. Inicia el temporizador.",
            "current_question_index": app_state.current_question_index(),
            "current_question": question.model_dump(mode="json"),
            "question_time": app_state.game_runtime_snapshot()["question_time"],
            "persistence_error": persistence_error,
        }

    async def start_question_timer(self) -> dict:
        if app_state.game_status() != "question_ready":
            raise HTTPException(status_code=400, detail="No hay una pregunta lista para iniciar temporizador")

        current_question = app_state.current_question()
        if current_question is None:
            raise HTTPException(status_code=400, detail="No hay pregunta activa")

        await self._cancel_timer()
        app_state.activate_question_timer()
        await self._send_led_all_assigned("off")

        self._timer_task = asyncio.create_task(
            self._run_question_timer(
                question_id=current_question.question_id,
                initial_seconds=app_state.question_remaining_time(),
            )
        )

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="question_timer_started",
            topic="internal/game/question/timer/start",
            payload={
                "question_index": app_state.current_question_index(),
                "question_id": current_question.question_id,
                "question_time": app_state.game_runtime_snapshot()["question_time"],
            },
            message="Temporizador iniciado",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

        return {
            "success": True,
            "message": "Temporizador iniciado",
            "current_question_index": app_state.current_question_index(),
            "question_time": app_state.game_runtime_snapshot()["question_time"],
        }

    async def pause_game(self, reason: str, source: str = "manual") -> dict:
        current_status = app_state.game_status()
        if current_status == "game_paused":
            return {
                "success": True,
                "message": "La partida ya estaba pausada",
                "game_status": current_status,
                "reason": app_state.game_pause_reason(),
            }

        allowed = {"game_running", "question_ready", "question_active", "waiting_for_answer", "question_finished"}
        if current_status not in allowed:
            raise HTTPException(status_code=400, detail="No se puede pausar en el estado actual")

        await self._cancel_timer()
        paused_from = app_state.pause_game(reason=reason)

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="game_paused",
            topic="internal/game/pause",
            payload={"reason": reason, "source": source, "paused_from_status": paused_from},
            message=f"Partida pausada: {reason}",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

        return {
            "success": True,
            "message": "Partida pausada",
            "game_status": app_state.game_status(),
            "reason": reason,
            "paused_from_status": paused_from,
        }

    async def resume_game(self) -> dict:
        if app_state.game_status() != "game_paused":
            raise HTTPException(status_code=400, detail="La partida no esta pausada")

        restored_status = app_state.resume_game()

        current_question = app_state.current_question()
        remaining = app_state.question_remaining_time()
        if restored_status == "question_active" and current_question is not None and remaining > 0:
            await self._cancel_timer()
            self._timer_task = asyncio.create_task(
                self._run_question_timer(
                    question_id=current_question.question_id,
                    initial_seconds=remaining,
                )
            )

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="game_resumed",
            topic="internal/game/resume",
            payload={"restored_status": restored_status},
            message="Partida reanudada",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

        return {
            "success": True,
            "message": "Partida reanudada",
            "game_status": app_state.game_status(),
            "restored_status": restored_status,
        }

    async def mark_answer_correct(self) -> dict:
        if app_state.game_status() not in {"question_active", "waiting_for_answer"}:
            raise HTTPException(status_code=400, detail="No hay pregunta activa")

        current_team = app_state.current_team()
        current_question = app_state.current_question()
        if current_team is None or current_question is None:
            raise HTTPException(status_code=400, detail="No hay equipo en turno")

        points_to_add = int(current_question.points)
        updated_team = app_state.apply_correct_answer(current_team.team_id, points_to_add)
        app_state.reveal_correct_answer(current_question.correct_answer)
        app_state.finish_question()
        
        teams = list(app_state._game_config.teams) if app_state._game_config else []
        question_time = app_state._game_config.question_time if app_state._game_config else 20
        press_history = app_state.press_history()
        pressed_team_ids = {press.team_id for press in press_history if press.question_id == current_question.question_id}
        
        for team in teams:
            if team.team_id not in pressed_team_ids:
                press_order = len(app_state.press_history()) + 1
                press_record = PressRecord(
                    question_id=current_question.question_id,
                    question_text=current_question.text,
                    team_id=team.team_id,
                    team_name=team.name,
                    control_id=team.control_id,
                    elapsed_time=round(float(question_time), 2),
                    press_order=press_order,
                    timestamp=datetime.now(timezone.utc)
                )
                app_state.add_press_record(press_record)
                self._persist_press_record(press_record)
        
        await self._cancel_timer()

        press_elapsed = 0.0
        press_queue = app_state.press_queue()
        if press_queue:
            for press in press_queue:
                if press.team_id == current_team.team_id:
                    press_elapsed = press.elapsed_time
                    break

        answer_record = AnswerRecord(
            question_id=current_question.question_id,
            question_text=current_question.text,
            team_id=current_team.team_id,
            team_name=current_team.name,
            control_id=current_team.control_id,
            result="correct",
            points_awarded=points_to_add,
            elapsed_time=press_elapsed,
            timestamp=datetime.now(timezone.utc)
        )
        app_state.add_answer_record(answer_record)
        self._persist_answer_record(answer_record)

        question_record = QuestionRecord(
            question_id=current_question.question_id,
            question_text=current_question.text,
            correct_answer=current_question.correct_answer,
            points=current_question.points,
            category=current_question.category,
            difficulty=current_question.difficulty,
            started_at=app_state.question_started_at(),
            finished_at=datetime.now(timezone.utc),
            attempts=len(press_queue) + 1,
            final_result="correct",
            answered_by_team_id=current_team.team_id,
            answered_by_team_name=current_team.name,
            points_awarded=points_to_add
        )
        app_state.add_question_record(question_record)
        self._persist_question_result(question_record)

        if updated_team is not None:
            self._send_led(updated_team.control_id, "on")
        await self._send_led_all_assigned("on")

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id=current_team.control_id,
            event_type="answer_correct",
            topic="internal/game/answer/correct",
            payload={
                "team_id": current_team.team_id,
                "team_name": current_team.name,
                "points_added": points_to_add,
                "correct_answer": current_question.correct_answer,
                "explanation": current_question.explanation,
            },
            team_id=current_team.team_id,
            team_name=current_team.name,
            message=f"Respuesta correcta: {current_team.name} (+{points_to_add})",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

        return {
            "success": True,
            "message": "Respuesta correcta",
            "team": current_team.name,
            "points_added": points_to_add,
            "new_score": updated_team.score if updated_team else current_team.score,
        }

    async def mark_answer_incorrect(self) -> dict:
        if app_state.game_status() not in {"question_active", "waiting_for_answer"}:
            raise HTTPException(status_code=400, detail="No hay pregunta activa")

        current_team = app_state.current_team()
        current_question = app_state.current_question()
        if current_team is None:
            raise HTTPException(status_code=400, detail="No hay equipo en turno")
        if current_question is None:
            raise HTTPException(status_code=400, detail="No hay pregunta activa")

        app_state.apply_incorrect_answer(current_team.team_id)
        app_state.block_team_current_question(current_team.team_id)

        press_elapsed = 0.0
        press_queue = app_state.press_queue()
        for press in press_queue:
            if press.team_id == current_team.team_id:
                press_elapsed = press.elapsed_time
                break

        answer_record = AnswerRecord(
            question_id=current_question.question_id,
            question_text=current_question.text,
            team_id=current_team.team_id,
            team_name=current_team.name,
            control_id=current_team.control_id,
            result="incorrect",
            points_awarded=0,
            elapsed_time=press_elapsed,
            timestamp=datetime.now(timezone.utc)
        )
        app_state.add_answer_record(answer_record)
        self._persist_answer_record(answer_record)

        game_uid = app_state.game_uid()
        if game_uid:
            try:
                upsert_teams_snapshot(game_uid, self._ranked_teams_snapshot())
            except Exception:
                app_state.mark_persisted(False)

        next_team = app_state.next_team_from_queue()
        if next_team is not None:
            app_state.set_waiting_for_answer()
            event = EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=current_team.control_id,
                event_type="answer_incorrect_next_team",
                topic="internal/game/answer/incorrect",
                payload={
                    "previous_team": current_team.team_id,
                    "next_team": next_team.team_id,
                },
                team_id=current_team.team_id,
                team_name=current_team.name,
                message=f"Respuesta incorrecta: pasa {next_team.name}",
            )
            app_state.add_event(event)
            await self._broadcast_event_and_state(event)
            return {
                "success": True,
                "message": "Respuesta incorrecta. Pasa el siguiente equipo.",
                "next_team": next_team.name,
            }

        app_state.finish_question()
        await self._cancel_timer()
        await self._send_led_all_assigned("on")
        app_state.reveal_correct_answer(current_question.correct_answer)
        
        teams = list(app_state._game_config.teams) if app_state._game_config else []
        question_time = app_state._game_config.question_time if app_state._game_config else 20
        press_history = app_state.press_history()
        pressed_team_ids = {press.team_id for press in press_history if press.question_id == current_question.question_id}
        
        for team in teams:
            if team.team_id not in pressed_team_ids:
                press_order = len(app_state.press_history()) + 1
                press_record = PressRecord(
                    question_id=current_question.question_id,
                    question_text=current_question.text,
                    team_id=team.team_id,
                    team_name=team.name,
                    control_id=team.control_id,
                    elapsed_time=round(float(question_time), 2),
                    press_order=press_order,
                    timestamp=datetime.now(timezone.utc)
                )
                app_state.add_press_record(press_record)
                self._persist_press_record(press_record)

        question_record = QuestionRecord(
            question_id=current_question.question_id,
            question_text=current_question.text,
            correct_answer=current_question.correct_answer,
            points=current_question.points,
            category=current_question.category,
            difficulty=current_question.difficulty,
            started_at=app_state.question_started_at(),
            finished_at=datetime.now(timezone.utc),
            attempts=len(press_queue),
            final_result="no_correct_answer",
            answered_by_team_id=None,
            answered_by_team_name=None,
            points_awarded=0
        )
        app_state.add_question_record(question_record)
        self._persist_question_result(question_record)

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id=current_team.control_id,
            event_type="answer_incorrect_no_more_teams",
            topic="internal/game/answer/incorrect",
            payload={
                "team_id": current_team.team_id,
                "correct_answer": current_question.correct_answer,
                "explanation": current_question.explanation,
            },
            team_id=current_team.team_id,
            team_name=current_team.name,
            message="Respuesta incorrecta. No hay mas equipos en cola.",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)
        return {
            "success": True,
            "message": "Respuesta incorrecta. No hay mas equipos en cola.",
            "question_finished": True,
        }

    async def skip_question(self) -> dict:
        current_question = app_state.current_question()
        if current_question is None:
            raise HTTPException(status_code=400, detail="No hay pregunta activa")

        question_record = QuestionRecord(
            question_id=current_question.question_id,
            question_text=current_question.text,
            correct_answer=current_question.correct_answer,
            points=current_question.points,
            category=current_question.category,
            difficulty=current_question.difficulty,
            started_at=app_state.question_started_at(),
            finished_at=datetime.now(timezone.utc),
            attempts=len(app_state.press_queue()),
            final_result="skipped",
            answered_by_team_id=None,
            answered_by_team_name=None,
            points_awarded=0,
        )
        app_state.add_question_record(question_record)
        self._persist_question_result(question_record)

        app_state.finish_question()
        await self._cancel_timer()
        await self._send_led_all_assigned("on")

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="question_skipped",
            topic="internal/game/question/skip",
            payload={"question_index": app_state.current_question_index()},
            message="Pregunta saltada",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)
        return {"success": True, "message": "Pregunta saltada", "question_finished": True}

    async def end_game(self, message: str = "Partida finalizada") -> dict:
        app_state.finish_game()
        final_ranking = app_state.finalize_game()
        ranking_payload = [r.model_dump() for r in final_ranking]

        persisted = app_state.is_persisted()
        persistence_error = None
        config = app_state.game_config()
        game_uid = app_state.game_uid()
        if game_uid and config is not None:
            try:
                upsert_game_start(
                    game_uid=game_uid,
                    game_name=config.game_name,
                    question_mode=config.question_mode,
                    question_time=config.question_time,
                    started_at=app_state.game_started_at().isoformat() if app_state.game_started_at() else None,
                    total_questions=app_state.prepared_questions_total(),
                )
                upsert_teams_snapshot(game_uid, ranking_payload)
                finalize_game_db(
                    game_uid=game_uid,
                    finished_at=app_state.game_finished_at().isoformat() if app_state.game_finished_at() else None,
                    total_questions=app_state.prepared_questions_total(),
                    winner_team_name=ranking_payload[0]["team_name"] if ranking_payload else None,
                )
                app_state.mark_persisted(True)
                persisted = True
            except Exception as exc:
                app_state.mark_persisted(False)
                persisted = False
                persistence_error = str(exc)

        await self._cancel_timer()
        await self._send_led_all_assigned("blink_slow")

        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="game_finished",
            topic="internal/game/end",
            payload={
                "ranking": ranking_payload,
                "game_uid": app_state.game_uid(),
                "is_persisted": persisted,
                "persistence_error": persistence_error,
            },
            message=message,
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)
        return {
            "success": True,
            "message": message,
            "game_status": app_state.game_status(),
            "ranking": ranking_payload,
            "game_uid": app_state.game_uid(),
            "is_persisted": persisted,
            "persistence_error": persistence_error,
        }

    def handle_button_press(self, device_id: str, topic: str, payload: dict[str, Any]) -> EventRecord:
        team = app_state.find_team_by_control(device_id)
        if team is None:
            return EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="button_ignored",
                topic=topic,
                payload=payload,
                message="Pulsacion ignorada: control no asignado",
            )

        current_status = app_state.game_status()
        if current_status not in {"question_active", "waiting_for_answer"}:
            return EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="button_ignored",
                topic=topic,
                payload=payload,
                team_id=team.team_id,
                team_name=team.name,
                message="Pulsacion ignorada: no hay pregunta activa",
            )

        if not app_state.question_accepting_presses():
            return EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="button_ignored",
                topic=topic,
                payload=payload,
                team_id=team.team_id,
                team_name=team.name,
                message="Pulsacion ignorada: tiempo agotado",
            )

        if app_state.is_team_blocked_current_question(team.team_id):
            return EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="button_ignored",
                topic=topic,
                payload=payload,
                team_id=team.team_id,
                team_name=team.name,
                message="Pulsacion ignorada: equipo bloqueado en esta pregunta",
            )

        if app_state.is_team_in_press_queue(team.team_id):
            return EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="button_ignored",
                topic=topic,
                payload=payload,
                team_id=team.team_id,
                team_name=team.name,
                message="Pulsacion ignorada: equipo ya esta en la cola",
            )

        current_question = app_state.current_question()
        if current_question is None:
            return EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id=device_id,
                event_type="button_ignored",
                topic=topic,
                payload=payload,
                team_id=team.team_id,
                team_name=team.name,
                message="Pulsacion ignorada: no hay pregunta activa",
            )

        started_at = app_state.question_started_at()
        elapsed_time = 0.0
        if started_at is not None:
            elapsed_time = max(0.0, (datetime.now(timezone.utc) - started_at).total_seconds())

        press = ButtonPress(
            device_id=device_id,
            team_id=team.team_id,
            team_name=team.name,
            question_id=current_question.question_id,
            server_timestamp=datetime.now(timezone.utc),
            elapsed_time=round(elapsed_time, 2),
        )
        app_state.add_press_to_queue(press)
        app_state.increment_team_total_presses(team.team_id)

        if app_state.current_team() is None:
            app_state.set_current_team(team.team_id)
            self._request_timer_stop()
        app_state.set_waiting_for_answer()
        self._send_led(device_id, "blink_fast")

        press_order = len(app_state.press_history()) + 1
        press_record = PressRecord(
            question_id=current_question.question_id,
            question_text=current_question.text,
            team_id=team.team_id,
            team_name=team.name,
            control_id=device_id,
            elapsed_time=round(elapsed_time, 2),
            press_order=press_order,
            timestamp=datetime.now(timezone.utc)
        )
        app_state.add_press_record(press_record)
        self._persist_press_record(press_record)

        return EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id=device_id,
            event_type=str(payload.get("event", "button_pressed")),
            topic=topic,
            payload={**payload, "elapsed_time": round(elapsed_time, 2)},
            team_id=team.team_id,
            team_name=team.name,
            message=f"{team.name} entro a la cola ({round(elapsed_time, 2)} s)",
        )

    async def on_button_event_processed(self, event: EventRecord) -> None:
        await ws_manager.broadcast_json({"type": "event_received", "data": event.model_dump(mode="json")})
        await self.broadcast_state()

    async def broadcast_state(self) -> None:
        await ws_manager.broadcast_json({"type": "game_state_updated", "data": app_state.game_runtime_snapshot()})

    async def _run_question_timer(self, question_id: str, initial_seconds: int) -> None:
        try:
            remaining = max(0, int(initial_seconds))
            app_state.set_question_remaining_time(remaining)
            await self.broadcast_state()

            while remaining > 0:
                await asyncio.sleep(1)
                status = app_state.game_status()
                current_question = app_state.current_question()
                if status != "question_active":
                    return
                if current_question is None or current_question.question_id != question_id:
                    return

                remaining -= 1
                app_state.set_question_remaining_time(remaining)
                await self.broadcast_state()

            await self._handle_time_expired(question_id)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[TIMER ERROR] {e}")

    async def _handle_time_expired(self, question_id: str) -> None:
        current_question = app_state.current_question()
        if current_question is None or current_question.question_id != question_id:
            return
        if app_state.game_status() not in {"question_active", "waiting_for_answer"}:
            return

        app_state.close_question_presses()
        current_team = app_state.current_team()
        if current_team is None:
            queued_team = app_state.next_team_from_queue()
            if queued_team is not None:
                app_state.set_waiting_for_answer()
                event = EventRecord(
                    timestamp=datetime.now(timezone.utc),
                    device_id="server",
                    event_type="question_timeout_with_queue",
                    topic="internal/game/timer",
                    payload={"selected_team": queued_team.team_id},
                    team_id=queued_team.team_id,
                    team_name=queued_team.name,
                    message=f"Tiempo agotado. Responde {queued_team.name}",
                )
                app_state.add_event(event)
                await self._broadcast_event_and_state(event)
                return

            app_state.reveal_correct_answer(current_question.correct_answer)
            app_state.finish_question()
            
            teams = list(app_state._game_config.teams) if app_state._game_config else []
            question_time = app_state._game_config.question_time if app_state._game_config else 20
            press_history = app_state.press_history()
            pressed_team_ids = {press.team_id for press in press_history if press.question_id == current_question.question_id}
            
            for team in teams:
                if team.team_id not in pressed_team_ids:
                    press_order = len(app_state.press_history()) + 1
                    press_record = PressRecord(
                        question_id=current_question.question_id,
                        question_text=current_question.text,
                        team_id=team.team_id,
                        team_name=team.name,
                        control_id=team.control_id,
                        elapsed_time=round(float(question_time), 2),
                        press_order=press_order,
                        timestamp=datetime.now(timezone.utc)
                    )
                    app_state.add_press_record(press_record)
                    self._persist_press_record(press_record)
            
            question_record = QuestionRecord(
                question_id=current_question.question_id,
                question_text=current_question.text,
                correct_answer=current_question.correct_answer,
                points=current_question.points,
                category=current_question.category,
                difficulty=current_question.difficulty,
                started_at=app_state.question_started_at(),
                finished_at=datetime.now(timezone.utc),
                attempts=0,
                final_result="timeout_no_answers",
                answered_by_team_id=None,
                answered_by_team_name=None,
                points_awarded=0,
            )
            app_state.add_question_record(question_record)
            self._persist_question_result(question_record)
            await self._send_led_all_assigned("on")
            event = EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id="server",
                event_type="question_timeout_no_answers",
                topic="internal/game/timer",
                payload={"question_id": question_id, "correct_answer": current_question.correct_answer},
                message=f"Tiempo agotado. Respuesta correcta: {current_question.correct_answer}",
            )
            app_state.add_event(event)
            await self._broadcast_event_and_state(event)
            return

        app_state.set_waiting_for_answer()
        event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="question_timeout_waiting_validation",
            topic="internal/game/timer",
            payload={"team_id": current_team.team_id},
            team_id=current_team.team_id,
            team_name=current_team.name,
            message=f"Tiempo agotado. Pendiente validacion de {current_team.name}",
        )
        app_state.add_event(event)
        await self._broadcast_event_and_state(event)

    async def _cancel_timer(self) -> None:
        if self._timer_task is None:
            return
        self._timer_task.cancel()
        try:
            await self._timer_task
        except asyncio.CancelledError:
            pass
        self._timer_task = None

    def _request_timer_stop(self) -> None:
        if self._loop is None or self._timer_task is None:
            return
        self._loop.call_soon_threadsafe(self._timer_task.cancel)

    async def _send_led_all_assigned(self, mode: str) -> None:
        for control_id in app_state.assigned_control_ids():
            self._send_led(control_id, mode)

    def _send_led(self, device_id: str, mode: str) -> None:
        if self._led_sender is None:
            return
        self._led_sender(device_id, mode)

    async def _broadcast_event_and_state(self, event: EventRecord) -> None:
        await ws_manager.broadcast_json({"type": "event_received", "data": event.model_dump(mode="json")})
        await self.broadcast_state()


game_engine = GameEngine()
