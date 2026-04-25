# AGENTS

## Active code and boundaries
- Primary runnable project is `trivia_mqtt/` (FastAPI + MQTT + WebSocket + HTML/CSS/JS).
- `trivia-control/` is a default PlatformIO scaffold (`src/main.cpp` is placeholder math code), not integrated with the Python app yet.
- Product intent lives in `TriviaMQTT_Proyecto.md`, but runtime behavior must follow executable code in `trivia_mqtt/app/`.

## Verified developer commands
- Install backend deps from repo root: `venv\Scripts\python.exe -m pip install -r trivia_mqtt\requirements.txt`
- Run API/UI server from `trivia_mqtt/`: `uvicorn app.main:app --reload`
- Run control simulator from `trivia_mqtt/`: `python tools/simulate_control.py control_01`
- Required local service: Mosquitto broker on `localhost:1883` (`mosquitto -v`)
- No automated test/lint/typecheck config is present; validate via manual smoke flow (`/setup`, `/host`, simulator `press`, LED test buttons).

## Architecture contracts (do not break)
- Keep MQTT I/O isolated in `trivia_mqtt/app/mqtt_client.py`; other modules should use `app_state`/API, not direct MQTT calls.
- FastAPI lifecycle starts MQTT client in `lifespan`; WebSocket updates are broadcast through `ws_manager`.
- Live pages are `/setup`, `/host`, and `/display`.
- Control presence is in-memory only and expires after `CONTROL_STALE_SECONDS = 6` (`app/config.py` + `app/state.py`).

## Data and protocol contracts
- MQTT topics in use:
  - status subscribe: `trivia/controls/+/status`
  - button subscribe: `trivia/controls/+/button`
  - led publish: `trivia/controls/{device_id}/led`
- Expected payloads are JSON; simulator sends `{"device_id": "...", "status": "online|offline"}` and button `{"device_id": "...", "event": "button_pressed"}`.
- `POST /api/game-config` enforces: non-empty `game_name`, 1-10 teams, unique `control_id`, and every assigned control must be currently detected.
- WebSocket message types consumed by frontend: `controls_updated`, `events_snapshot`, `event_received`, `game_config_updated`, `teams_updated`, `questions_updated`, `questions_config_updated`, `game_state_updated`.

## Frontend safety constraints
- `setup.js` persists unsaved form draft in `localStorage` key `trivia_mqtt_setup_draft_v1`; keep this behavior.
- WebSocket-driven control refresh must not wipe in-progress setup inputs/selections.
- Clear draft storage only after successful game-config save (current behavior in `saveGameConfig`).
- Reuse design tokens from `trivia_mqtt/app/static/css/theme.css` (dark palette + semantic colors) instead of redefining per page.

## If you add tooling
- If tests/lint/typecheck/build are introduced, update this file with exact commands and required execution order.
- Validate changes via manual smoke flow: start Mosquitto, run server, run simulator, press button, verify LED response.
