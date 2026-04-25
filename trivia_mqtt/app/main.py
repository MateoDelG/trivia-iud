"""FastAPI entrypoint for TriviaMQTT v1."""

import asyncio
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.game_engine import game_engine
from app.models import EventRecord, GameConfig, LedCommandRequest, QuestionModeRequest, Team
from app.mqtt_client import mqtt_service
from app.question_loader import SUPPORTED_EXTENSIONS, load_questions_from_file
from app.state import app_state
from app.websocket_manager import ws_manager

BASE_DIR = Path(__file__).resolve().parent


def _controls_signature() -> list[tuple[str, str]]:
    controls = app_state.controls()
    return [(control.device_id, control.status) for control in controls]


def _questions_snapshot() -> dict:
    return {
        "questions_loaded": app_state.questions_loaded(),
        "total_questions": app_state.total_questions(),
        "question_mode": app_state.question_mode(),
        "questions": [question.model_dump(mode="json") for question in app_state.questions()],
    }


async def _presence_watchdog() -> None:
    previous_signature = _controls_signature()
    while True:
        await asyncio.sleep(1)
        current_signature = _controls_signature()
        if current_signature == previous_signature:
            continue

        previous_signature = current_signature
        controls_payload = [control.model_dump(mode="json") for control in app_state.controls()]
        await ws_manager.broadcast_json({"type": "controls_updated", "data": controls_payload})


@asynccontextmanager
async def lifespan(app: FastAPI):
    mqtt_service.set_loop(asyncio.get_running_loop())
    game_engine.set_loop(asyncio.get_running_loop())
    game_engine.set_led_sender(mqtt_service.publish_led_command)
    mqtt_service.start()
    presence_task = asyncio.create_task(_presence_watchdog())
    try:
        yield
    finally:
        presence_task.cancel()
        try:
            await presence_task
        except asyncio.CancelledError:
            pass
        mqtt_service.stop()


app = FastAPI(title="TriviaMQTT", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/host", response_class=HTMLResponse)
async def host_view(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("host.html", {"request": request})


@app.get("/setup", response_class=HTMLResponse)
async def setup_view(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("setup.html", {"request": request})


@app.get("/display", response_class=HTMLResponse)
async def display_page(request: Request):
    return templates.TemplateResponse("display.html", {"request": request})


@app.get("/results", response_class=HTMLResponse)
async def results_page(request: Request):
    return templates.TemplateResponse("results.html", {"request": request})


@app.get("/api/controls")
async def get_controls() -> dict:
    controls = [control.model_dump(mode="json") for control in app_state.controls()]
    return {"controls": controls}


@app.get("/api/events")
async def get_events() -> dict:
    events = [event.model_dump(mode="json") for event in app_state.events()]
    return {"events": events}


@app.get("/api/game-config")
async def get_game_config() -> dict:
    game_config = app_state.game_config()
    return {
        "game_status": app_state.game_status(),
        "game_config": game_config.model_dump(mode="json") if game_config else None,
    }


@app.get("/api/teams")
async def get_teams() -> dict:
    teams = [team.model_dump(mode="json") for team in app_state.teams()]
    return {"teams": teams}


@app.get("/api/questions")
async def get_questions() -> dict:
    return _questions_snapshot()


@app.get("/api/game/state")
async def get_game_state() -> dict:
    return app_state.game_runtime_snapshot()


@app.post("/api/game-config")
async def save_game_config(payload: GameConfig) -> dict:
    game_name = payload.game_name.strip()
    if not game_name:
        raise HTTPException(status_code=400, detail="game_name no puede estar vacio")

    question_time = payload.question_time if payload.question_time is not None else 20
    if question_time < 5 or question_time > 120:
        raise HTTPException(status_code=400, detail="question_time debe estar entre 5 y 120 segundos")

    if len(payload.teams) < 1 or len(payload.teams) > 10:
        raise HTTPException(status_code=400, detail="La partida debe tener entre 1 y 10 equipos")

    detected_controls = {control.device_id for control in app_state.controls()}
    if not detected_controls:
        raise HTTPException(status_code=400, detail="No hay controles detectados")

    normalized_teams = []
    used_controls = set()
    for team in payload.teams:
        team_id = team.team_id.strip()
        team_name = team.name.strip()
        control_id = team.control_id.strip()

        if not team_id:
            raise HTTPException(status_code=400, detail="Cada equipo debe tener team_id")
        if not team_name:
            raise HTTPException(status_code=400, detail="Cada equipo debe tener nombre")
        if not control_id:
            raise HTTPException(status_code=400, detail="Cada equipo debe tener control asignado")
        if control_id in used_controls:
            raise HTTPException(status_code=400, detail="No se pueden repetir controles")
        if control_id not in detected_controls:
            raise HTTPException(
                status_code=400,
                detail=f"El control asignado no existe o no esta detectado: {control_id}",
            )

        used_controls.add(control_id)
        normalized_teams.append(
            Team(
                team_id=team_id,
                name=team_name,
                control_id=control_id,
                score=0,
                correct_answers=0,
                incorrect_answers=0,
                total_presses=0,
                is_active=True,
            )
        )

    saved_config = app_state.set_game_config(
        GameConfig(
            game_name=game_name,
            status="configured",
            question_time=question_time,
            question_mode=app_state.question_mode(),
            teams=normalized_teams,
        )
    )

    for team in saved_config.teams:
        mqtt_service.publish_led_command(device_id=team.control_id, mode="on")

    config_event = EventRecord(
        timestamp=datetime.now(timezone.utc),
        device_id="server",
        event_type="game_configured",
        topic="internal/game-config",
        payload={
            "game_name": saved_config.game_name,
            "team_count": len(saved_config.teams),
            "question_time": saved_config.question_time,
            "question_mode": saved_config.question_mode,
        },
        message=f"Partida configurada: {saved_config.game_name}",
    )
    app_state.add_event(config_event)

    await ws_manager.broadcast_json(
        {
            "type": "game_config_updated",
            "data": saved_config.model_dump(mode="json"),
            "game_status": app_state.game_status(),
        }
    )
    await ws_manager.broadcast_json(
        {
            "type": "teams_updated",
            "data": [team.model_dump(mode="json") for team in saved_config.teams],
        }
    )
    await ws_manager.broadcast_json(
        {
            "type": "event_received",
            "data": config_event.model_dump(mode="json"),
        }
    )
    await game_engine.broadcast_state()

    return {
        "ok": True,
        "game_status": app_state.game_status(),
        "game_config": saved_config.model_dump(mode="json"),
    }


@app.post("/api/controls/{device_id}/led")
async def send_led_command(device_id: str, payload: LedCommandRequest) -> dict:
    if not device_id.strip():
        raise HTTPException(status_code=400, detail="Invalid device_id")

    mqtt_service.publish_led_command(device_id=device_id, mode=payload.mode)
    return {"ok": True, "device_id": device_id, "mode": payload.mode}


@app.post("/api/controls/{device_id}/test")
async def test_control(device_id: str) -> dict:
    if not device_id.strip():
        raise HTTPException(status_code=400, detail="Invalid device_id")

    detected_controls = {control.device_id for control in app_state.controls()}
    if device_id not in detected_controls:
        raise HTTPException(status_code=404, detail="Control no detectado")

    mqtt_service.publish_led_command(device_id=device_id, mode="blink_fast")

    event = EventRecord(
        timestamp=datetime.now(timezone.utc),
        device_id=device_id,
        event_type="control_test",
        topic=f"trivia/controls/{device_id}/led",
        payload={"mode": "blink_fast"},
        message=f"Prueba de control enviada a {device_id}",
    )
    app_state.add_event(event)

    await ws_manager.broadcast_json({"type": "event_received", "data": event.model_dump(mode="json")})
    return {"ok": True, "device_id": device_id, "mode": "blink_fast"}


@app.post("/api/questions/upload")
async def upload_questions(file: UploadFile = File(...)) -> dict:
    filename = (file.filename or "").strip()
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        error_message = "Formato no soportado. Solo se permiten archivos .csv o .xlsx"
        error_event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="questions_upload_failed",
            topic="internal/questions/upload",
            payload={"filename": filename, "errors": [error_message]},
            message=error_message,
        )
        app_state.add_event(error_event)
        await ws_manager.broadcast_json({"type": "event_received", "data": error_event.model_dump(mode="json")})
        await game_engine.broadcast_state()
        return {"success": False, "message": "El archivo no es valido", "errors": [error_message]}

    temp_path: Path | None = None
    try:
        file_bytes = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
            temp_file.write(file_bytes)
            temp_path = Path(temp_file.name)

        questions, errors = load_questions_from_file(str(temp_path))
        if errors:
            error_event = EventRecord(
                timestamp=datetime.now(timezone.utc),
                device_id="server",
                event_type="questions_upload_failed",
                topic="internal/questions/upload",
                payload={"filename": filename, "errors": errors},
                message="Error validando banco de preguntas",
            )
            app_state.add_event(error_event)
            await ws_manager.broadcast_json(
                {"type": "event_received", "data": error_event.model_dump(mode="json")}
            )
            await game_engine.broadcast_state()
            return {"success": False, "message": "El archivo no es valido", "errors": errors}

        app_state.set_questions(questions)

        success_event = EventRecord(
            timestamp=datetime.now(timezone.utc),
            device_id="server",
            event_type="questions_loaded",
            topic="internal/questions/upload",
            payload={"filename": filename, "total_questions": len(questions)},
            message=f"Banco de preguntas cargado: {len(questions)} preguntas",
        )
        app_state.add_event(success_event)

        questions_payload = _questions_snapshot()
        await ws_manager.broadcast_json({"type": "questions_updated", "data": questions_payload})
        await ws_manager.broadcast_json({"type": "event_received", "data": success_event.model_dump(mode="json")})
        await game_engine.broadcast_state()

        return {
            "success": True,
            "message": "Archivo cargado correctamente",
            "total_questions": len(questions),
            "questions_preview": [question.model_dump(mode="json") for question in questions[:10]],
        }
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


@app.post("/api/questions/config")
async def save_questions_config(payload: QuestionModeRequest) -> dict:
    question_mode = payload.question_mode
    if question_mode not in {"ordered", "random"}:
        raise HTTPException(status_code=400, detail="question_mode debe ser ordered o random")

    app_state.set_question_mode(question_mode)

    mode_event = EventRecord(
        timestamp=datetime.now(timezone.utc),
        device_id="server",
        event_type="question_mode_updated",
        topic="internal/questions/config",
        payload={"question_mode": question_mode},
        message=f"Modo de preguntas actualizado a {question_mode}",
    )
    app_state.add_event(mode_event)

    await ws_manager.broadcast_json(
        {
            "type": "questions_config_updated",
            "data": {
                "question_mode": question_mode,
            },
        }
    )
    await ws_manager.broadcast_json({"type": "event_received", "data": mode_event.model_dump(mode="json")})
    await game_engine.broadcast_state()

    return {
        "success": True,
        "question_mode": question_mode,
        "message": "Modo de preguntas actualizado",
    }


@app.post("/api/game/start")
async def game_start() -> dict:
    return await game_engine.start_game()


@app.post("/api/game/question/start")
async def game_question_start() -> dict:
    return await game_engine.start_next_question()


@app.post("/api/game/question/timer/start")
async def game_question_timer_start() -> dict:
    return await game_engine.start_question_timer()


@app.post("/api/game/answer/correct")
async def game_answer_correct() -> dict:
    return await game_engine.mark_answer_correct()


@app.post("/api/game/answer/incorrect")
async def game_answer_incorrect() -> dict:
    return await game_engine.mark_answer_incorrect()


@app.post("/api/game/question/skip")
async def game_question_skip() -> dict:
    return await game_engine.skip_question()


@app.post("/api/game/pause")
async def game_pause() -> dict:
    return await game_engine.pause_game(reason="Pausa manual del host", source="manual")


@app.post("/api/game/resume")
async def game_resume() -> dict:
    return await game_engine.resume_game()


@app.post("/api/game/end")
async def game_end() -> dict:
    return await game_engine.end_game()


class ViewChangeRequest(BaseModel):
    view: str


@app.post("/api/display/view")
async def set_display_view(request: ViewChangeRequest):
    await ws_manager.broadcast_json({
        "type": "view_change",
        "data": {"view": request.view}
    })
    return {"success": True}
    return {"success": True}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    initial_controls = [control.model_dump(mode="json") for control in app_state.controls()]
    initial_events = [event.model_dump(mode="json") for event in app_state.events()]
    initial_game_config = app_state.game_config()
    initial_teams = [team.model_dump(mode="json") for team in app_state.teams()]
    await websocket.send_json({"type": "controls_updated", "data": initial_controls})
    await websocket.send_json({"type": "events_snapshot", "data": initial_events})
    await websocket.send_json(
        {
            "type": "game_config_updated",
            "data": initial_game_config.model_dump(mode="json") if initial_game_config else None,
            "game_status": app_state.game_status(),
        }
    )
    await websocket.send_json({"type": "teams_updated", "data": initial_teams})
    await websocket.send_json({"type": "questions_updated", "data": _questions_snapshot()})
    await websocket.send_json(
        {"type": "questions_config_updated", "data": {"question_mode": app_state.question_mode()}}
    )
    await websocket.send_json({"type": "game_state_updated", "data": app_state.game_runtime_snapshot()})

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.get("/api/results")
async def get_all_results():
    ranking = app_state.finalize_game() if app_state.game_status() == "game_finished" else []
    questions = app_state.question_history()
    answers = app_state.answer_history()
    presses = app_state.press_history()
    events = app_state.events()
    
    return {
        "game_name": app_state.game_config().game_name if app_state.game_config() else None,
        "game_started_at": app_state.game_started_at().isoformat() if app_state.game_started_at() else None,
        "game_finished_at": app_state.game_finished_at().isoformat() if app_state.game_finished_at() else None,
        "game_status": app_state.game_status(),
        "final_ranking": [r.model_dump() for r in ranking],
        "questions": {
            "total": len(questions),
            "items": [q.model_dump() for q in questions],
        },
        "answers": {
            "total": len(answers),
            "items": [a.model_dump() for a in answers],
        },
        "presses": {
            "total": len(presses),
            "items": [p.model_dump() for p in presses],
        },
        "events": {
            "total": len(events),
            "items": [e.model_dump() for e in events],
        },
    }


@app.get("/api/results/summary")
async def get_results_summary():
    if app_state.game_status() != "game_finished":
        return {
            "game_name": app_state.game_config().game_name if app_state.game_config() else None,
            "game_started_at": app_state.game_started_at().isoformat() if app_state.game_started_at() else None,
            "game_finished_at": app_state.game_finished_at().isoformat() if app_state.game_finished_at() else None,
            "final_ranking": [],
        }
    final_ranking = app_state.finalize_game()
    return {
        "game_name": app_state.game_config().game_name if app_state.game_config() else None,
        "game_started_at": app_state.game_started_at().isoformat() if app_state.game_started_at() else None,
        "game_finished_at": app_state.game_finished_at().isoformat() if app_state.game_finished_at() else None,
        "final_ranking": [r.model_dump() for r in final_ranking],
    }


@app.get("/api/results/questions")
async def get_results_questions():
    history = app_state.question_history()
    return {
        "total_questions": len(history),
        "questions": [q.model_dump() for q in history],
    }


@app.get("/api/results/answers")
async def get_results_answers():
    history = app_state.answer_history()
    return {
        "total_answers": len(history),
        "answers": [a.model_dump() for a in history],
    }


@app.get("/api/results/presses")
async def get_results_presses():
    history = app_state.press_history()
    return {
        "total_presses": len(history),
        "presses": [p.model_dump() for p in history],
    }


@app.get("/api/results/events")
async def get_results_events():
    events = app_state.events()
    return {
        "total_events": len(events),
        "events": [e.model_dump() for e in events],
    }


def _build_csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    if not rows:
        csv_content = "No data available"
    else:
        headers = list(rows[0].keys())
        csv_lines = [",".join(headers)]
        for row in rows:
            values = [str(row.get(h, "")) for h in headers]
            csv_lines.append(",".join(values))
        csv_content = "\n".join(csv_lines)

    async def iter_csv():
        yield csv_content

    return StreamingResponse(
        iter_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/results/export/summary.csv")
async def export_summary_csv():
    ranking = app_state.finalize_game() if app_state.game_status() == "game_finished" else []
    rows = [r.model_dump() for r in ranking]
    return _build_csv_response(rows, "trivia_summary.csv")


@app.get("/api/results/export/questions.csv")
async def export_questions_csv():
    questions = app_state.question_history()
    rows = [q.model_dump() for q in questions]
    return _build_csv_response(rows, "trivia_questions.csv")


@app.get("/api/results/export/answers.csv")
async def export_answers_csv():
    answers = app_state.answer_history()
    rows = [a.model_dump() for a in answers]
    return _build_csv_response(rows, "trivia_answers.csv")


@app.get("/api/results/export/presses.csv")
async def export_presses_csv():
    presses = app_state.press_history()
    rows = [p.model_dump() for p in presses]
    return _build_csv_response(rows, "trivia_presses.csv")


@app.get("/api/results/export/events.csv")
async def export_events_csv():
    events = app_state.events()
    rows = [e.model_dump() for e in events]
    return _build_csv_response(rows, "trivia_events.csv")
