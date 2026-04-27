# AGENTS

## Active code and boundaries
- Primary runnable app is `trivia_mqtt/` (FastAPI + MQTT + WebSocket + HTML/CSS/JS).
- `trivia-control/` is a PlatformIO scaffold and is not integrated with `trivia_mqtt` runtime flow.

## Verified developer commands
- Install deps (repo root): `venv\Scripts\python.exe -m pip install -r trivia_mqtt\requirements.txt`
- Run server (from `trivia_mqtt/`): `uvicorn app.main:app --reload`
- Run control simulator (from `trivia_mqtt/`): `python tools/simulate_control.py control_01`
- Required local service: Mosquitto broker on `localhost:1883` (`mosquitto -v`)
- No test/lint/typecheck automation is configured; verify with manual smoke flow.

## Runtime architecture contracts
- Keep MQTT I/O in `trivia_mqtt/app/mqtt_client.py`; do not publish/subscribe directly from routes or frontend helpers.
- FastAPI `lifespan` starts MQTT and sets game-engine loop/LED sender wiring.
- Shared runtime state is in-memory via `app_state` (`app/state.py`); process restart clears game/results history.
- Control liveness expires via `CONTROL_STALE_SECONDS = 6`.

## Live routes and result surfaces
- Primary UI routes: `/setup`, `/host`, `/display`, `/results`.
- Game state source for UIs is `/api/game/state` + `/ws` broadcasts.
- Results API exists both split and unified:
  - unified: `GET /api/results`
  - split: `GET /api/results/{summary,questions,answers,presses,events}`
  - CSV export: `GET /api/results/export/{summary,questions,answers,presses,events}.csv`

## Data/protocol contracts
- MQTT topics:
  - subscribe status: `trivia/controls/+/status`
  - subscribe button: `trivia/controls/+/button`
  - publish LED: `trivia/controls/{device_id}/led`
- Expected JSON payloads from simulator:
  - status: `{"device_id":"...","status":"online|offline"}`
  - button: `{"device_id":"...","event":"button_pressed"}`
- `POST /api/game-config` requires non-empty `game_name`, 1-10 teams, unique `control_id`, and assigned controls currently detected.

## Frontend constraints that are easy to break
- `setup.js` draft persistence key is `trivia_mqtt_setup_draft_v1`; keep and clear it only after successful config save.
- In `host.js`, `controlTemplate`, `eventTemplate`, and `teamTemplate` must be defined before render functions run.
- Host-triggered display/results view switching currently relies on cross-tab signaling in frontend (`localStorage` key `display_view` and listeners in `display.js`/`results.js`).
- Reuse `app/static/css/theme.css` tokens instead of page-local palette reinvention.

## Manual verification checklist (current source of truth)
- Start Mosquitto, start server, run at least one simulator.
- Validate `/setup` config save, `/host` game flow (start -> question -> timer -> answer marking), and `/display` live updates.
- Validate results at `/results`, `GET /api/results`, and at least one CSV export endpoint.

## If tooling is introduced later
- If tests/lint/typecheck/build are added, update this file with exact commands and required order.
