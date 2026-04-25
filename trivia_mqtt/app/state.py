"""In-memory state store for controls and recent events."""

from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, List, Optional

from app.config import CONTROL_STALE_SECONDS, MAX_EVENTS
from app.models import ControlState, EventRecord, GameConfig, Question, Team


class AppState:
    def __init__(self) -> None:
        self._lock = Lock()
        self._controls: Dict[str, ControlState] = {}
        self._events: deque[EventRecord] = deque(maxlen=MAX_EVENTS)
        self._game_config: Optional[GameConfig] = None
        self._game_status: str = "idle"
        self._questions: List[Question] = []
        self._questions_loaded: bool = False
        self._total_questions: int = 0
        self._question_mode: str = "ordered"

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def upsert_control_status(self, device_id: str, status: str) -> ControlState:
        with self._lock:
            control = ControlState(device_id=device_id, status=status, last_seen=self._now())
            self._controls[device_id] = control
            return control

    def mark_control_seen(self, device_id: str, fallback_status: str = "online") -> ControlState:
        with self._lock:
            previous = self._controls.get(device_id)
            status = previous.status if previous else fallback_status
            control = ControlState(device_id=device_id, status=status, last_seen=self._now())
            self._controls[device_id] = control
            return control

    def remove_control(self, device_id: str) -> None:
        with self._lock:
            self._controls.pop(device_id, None)

    def add_event(self, event: EventRecord) -> None:
        with self._lock:
            self._events.appendleft(event)

    def controls(self) -> List[ControlState]:
        with self._lock:
            controls = list(self._controls.values())

        now = self._now()
        active_controls: List[ControlState] = []
        for control in controls:
            age_seconds = (now - control.last_seen).total_seconds()
            if age_seconds > CONTROL_STALE_SECONDS:
                continue
            active_controls.append(control)

        active_controls.sort(key=lambda item: item.device_id)
        return active_controls

    def events(self) -> List[EventRecord]:
        with self._lock:
            return list(self._events)

    def set_game_config(self, config: GameConfig) -> GameConfig:
        with self._lock:
            normalized_teams = [
                Team(team_id=team.team_id, name=team.name, control_id=team.control_id, score=0)
                for team in config.teams
            ]
            self._game_config = GameConfig(
                game_name=config.game_name,
                status="configured",
                question_time=config.question_time,
                question_mode=config.question_mode,
                teams=normalized_teams,
            )
            self._game_status = "configured"
            self._question_mode = config.question_mode
            return self._game_config.model_copy(deep=True)

    def game_config(self) -> Optional[GameConfig]:
        with self._lock:
            if self._game_config is None:
                return None
            return self._game_config.model_copy(deep=True)

    def teams(self) -> List[Team]:
        with self._lock:
            if self._game_config is None:
                return []
            teams = [team.model_copy(deep=True) for team in self._game_config.teams]
        teams.sort(key=lambda item: item.team_id)
        return teams

    def game_status(self) -> str:
        with self._lock:
            return self._game_status

    def set_questions(self, questions: List[Question]) -> None:
        with self._lock:
            self._questions = [question.model_copy(deep=True) for question in questions]
            self._total_questions = len(self._questions)
            self._questions_loaded = self._total_questions > 0

    def questions(self) -> List[Question]:
        with self._lock:
            return [question.model_copy(deep=True) for question in self._questions]

    def questions_loaded(self) -> bool:
        with self._lock:
            return self._questions_loaded

    def total_questions(self) -> int:
        with self._lock:
            return self._total_questions

    def set_question_mode(self, mode: str) -> str:
        with self._lock:
            self._question_mode = mode
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"question_mode": mode})
            return self._question_mode

    def question_mode(self) -> str:
        with self._lock:
            return self._question_mode

    def find_team_by_control(self, control_id: str) -> Optional[Team]:
        with self._lock:
            if self._game_config is None:
                return None
            for team in self._game_config.teams:
                if team.control_id == control_id:
                    return team.model_copy(deep=True)
        return None


app_state = AppState()
