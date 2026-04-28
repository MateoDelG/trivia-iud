"""In-memory state store for controls, config and game runtime."""

from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, List, Optional
from uuid import uuid4

from app.config import CONTROL_STALE_SECONDS, MAX_EVENTS
from app.models import (
    AnswerRecord,
    ButtonPress,
    ControlState,
    EventRecord,
    GameConfig,
    PressRecord,
    Question,
    QuestionRecord,
    ScoreAdjustmentRecord,
    Team,
    TeamResult,
)


class AppState:
    def __init__(self) -> None:
        self._lock = Lock()
        self._controls: Dict[str, ControlState] = {}
        self._events: deque[EventRecord] = deque(maxlen=MAX_EVENTS)
        self._game_config: Optional[GameConfig] = None
        self._game_status: str = "setup"

        self._questions: List[Question] = []
        self._questions_loaded: bool = False
        self._total_questions: int = 0
        self._question_mode: str = "ordered"

        self._prepared_questions: List[Question] = []
        self._current_question_index: int = -1
        self._current_question: Optional[Question] = None
        self._current_team_id: Optional[str] = None
        self._press_queue: List[ButtonPress] = []
        self._blocked_teams_current_question: set[str] = set()
        self._question_started_at: Optional[datetime] = None
        self._question_remaining_time: int = 0
        self._question_finished: bool = False
        self._game_finished: bool = False
        self._question_accepting_presses: bool = False
        self._answer_revealed: bool = False
        self._revealed_correct_answer: Optional[str] = None
        self._game_pause_reason: Optional[str] = None
        self._paused_from_status: Optional[str] = None

        self._press_history: List[PressRecord] = []
        self._answer_history: List[AnswerRecord] = []
        self._question_history: List[QuestionRecord] = []
        self._game_started_at: Optional[datetime] = None
        self._game_finished_at: Optional[datetime] = None
        self._game_uid: Optional[str] = None
        self._is_persisted: bool = False
        self._score_adjustments: List[ScoreAdjustmentRecord] = []

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
                Team(
                    team_id=team.team_id,
                    name=team.name,
                    control_id=team.control_id,
                    score=0,
                    correct_answers=0,
                    incorrect_answers=0,
                    total_presses=0,
                    is_active=True,
                )
                for team in config.teams
            ]
            self._game_config = GameConfig(
                game_name=config.game_name,
                status="configured",
                question_time=config.question_time,
                question_mode=config.question_mode,
                visual_config=config.visual_config,
                teams=normalized_teams,
            )
            self._question_mode = config.question_mode
            self._game_status = "configured"
            self._reset_runtime_locked()
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

    def set_game_status(self, status: str) -> str:
        with self._lock:
            self._game_status = status
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": status})
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

    def team_by_id(self, team_id: str) -> Optional[Team]:
        with self._lock:
            if self._game_config is None:
                return None
            for team in self._game_config.teams:
                if team.team_id == team_id:
                    return team.model_copy(deep=True)
        return None

    def assigned_control_ids(self) -> List[str]:
        with self._lock:
            if self._game_config is None:
                return []
            return [team.control_id for team in self._game_config.teams]

    def prepare_game(self, prepared_questions: List[Question]) -> None:
        with self._lock:
            self._prepared_questions = [question.model_copy(deep=True) for question in prepared_questions]
            self._current_question_index = -1
            self._current_question = None
            self._current_team_id = None
            self._press_queue = []
            self._blocked_teams_current_question = set()
            self._question_started_at = None
            self._question_remaining_time = 0
            self._question_finished = False
            self._question_accepting_presses = False
            self._game_finished = False
            self._game_status = "game_running"
            self._answer_revealed = False
            self._revealed_correct_answer = None
            self._game_started_at = self._now()
            self._game_finished_at = None
            self._press_history = []
            self._answer_history = []
            self._question_history = []
            self._score_adjustments = []
            self._game_uid = str(uuid4())
            self._is_persisted = False
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": "game_running"})
                reset_teams = [
                    team.model_copy(
                        update={
                            "score": 0,
                            "correct_answers": 0,
                            "incorrect_answers": 0,
                            "total_presses": 0,
                            "is_active": True,
                        }
                    )
                    for team in self._game_config.teams
                ]
                self._game_config = self._game_config.model_copy(update={"teams": reset_teams})

    def prepared_questions_total(self) -> int:
        with self._lock:
            return len(self._prepared_questions)

    def current_question(self) -> Optional[Question]:
        with self._lock:
            if self._current_question is None:
                return None
            return self._current_question.model_copy(deep=True)

    def current_question_index(self) -> int:
        with self._lock:
            return self._current_question_index

    def start_next_question(self) -> Optional[Question]:
        with self._lock:
            next_index = self._current_question_index + 1
            if next_index >= len(self._prepared_questions):
                return None

            self._current_question_index = next_index
            self._current_question = self._prepared_questions[next_index].model_copy(deep=True)
            self._current_team_id = None
            self._press_queue = []
            self._blocked_teams_current_question = set()
            self._question_started_at = self._now()
            self._question_remaining_time = self._game_config.question_time if self._game_config else 20
            self._question_finished = False
            self._question_accepting_presses = False
            self._game_status = "question_ready"
            self._answer_revealed = False
            self._revealed_correct_answer = None
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": "question_ready"})
            return self._current_question.model_copy(deep=True)

    def activate_question_timer(self) -> None:
        with self._lock:
            self._question_started_at = self._now()
            self._question_accepting_presses = True
            self._game_status = "question_active"
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": "question_active"})

    def pause_game(self, reason: str) -> str:
        with self._lock:
            if self._game_status == "game_paused":
                if reason:
                    self._game_pause_reason = reason
                return self._paused_from_status or "game_running"

            self._paused_from_status = self._game_status
            self._game_status = "game_paused"
            self._game_pause_reason = reason
            self._question_accepting_presses = False
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": "game_paused"})
            return self._paused_from_status or "game_running"

    def resume_game(self) -> str:
        with self._lock:
            if self._game_status != "game_paused":
                return self._game_status

            restore_status = self._paused_from_status or "game_running"
            self._game_status = restore_status
            self._game_pause_reason = None
            self._paused_from_status = None
            self._question_accepting_presses = restore_status in {"question_active", "waiting_for_answer"}
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": restore_status})
            return restore_status

    def game_pause_reason(self) -> Optional[str]:
        with self._lock:
            return self._game_pause_reason

    def question_started_at(self) -> Optional[datetime]:
        with self._lock:
            return self._question_started_at

    def question_remaining_time(self) -> int:
        with self._lock:
            return self._question_remaining_time

    def set_question_remaining_time(self, remaining: int) -> int:
        with self._lock:
            self._question_remaining_time = max(0, int(remaining))
            return self._question_remaining_time

    def question_accepting_presses(self) -> bool:
        with self._lock:
            return self._question_accepting_presses

    def close_question_presses(self) -> None:
        with self._lock:
            self._question_accepting_presses = False

    def is_team_blocked_current_question(self, team_id: str) -> bool:
        with self._lock:
            return team_id in self._blocked_teams_current_question

    def block_team_current_question(self, team_id: str) -> None:
        with self._lock:
            self._blocked_teams_current_question.add(team_id)

    def is_team_in_press_queue(self, team_id: str) -> bool:
        with self._lock:
            return any(press.team_id == team_id for press in self._press_queue)

    def add_press_to_queue(self, press: ButtonPress) -> None:
        with self._lock:
            self._press_queue.append(press.model_copy(deep=True))

    def press_queue(self) -> List[ButtonPress]:
        with self._lock:
            return [press.model_copy(deep=True) for press in self._press_queue]

    def set_current_team(self, team_id: Optional[str]) -> None:
        with self._lock:
            self._current_team_id = team_id

    def current_team(self) -> Optional[Team]:
        with self._lock:
            if self._current_team_id is None or self._game_config is None:
                return None
            for team in self._game_config.teams:
                if team.team_id == self._current_team_id:
                    return team.model_copy(deep=True)
        return None

    def set_waiting_for_answer(self) -> None:
        with self._lock:
            self._game_status = "waiting_for_answer"
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": "waiting_for_answer"})

    def next_team_from_queue(self) -> Optional[Team]:
        with self._lock:
            if self._game_config is None:
                return None
            sorted_queue = sorted(
                self._press_queue,
                key=lambda press: (press.elapsed_time, press.server_timestamp),
            )
            for press in sorted_queue:
                if press.team_id in self._blocked_teams_current_question:
                    continue
                for team in self._game_config.teams:
                    if team.team_id == press.team_id:
                        self._current_team_id = team.team_id
                        return team.model_copy(deep=True)
            self._current_team_id = None
            return None

    def increment_team_total_presses(self, team_id: str) -> Optional[Team]:
        with self._lock:
            return self._update_team_locked(team_id, total_presses_delta=1)

    def apply_correct_answer(self, team_id: str, points: int) -> Optional[Team]:
        with self._lock:
            return self._update_team_locked(team_id, score_delta=points, correct_delta=1)

    def apply_incorrect_answer(self, team_id: str) -> Optional[Team]:
        with self._lock:
            return self._update_team_locked(team_id, incorrect_delta=1)

    def finish_question(self) -> None:
        with self._lock:
            self._question_finished = True
            self._question_accepting_presses = False
            if self._game_status != "game_finished":
                self._game_status = "question_finished"
                if self._game_config is not None:
                    self._game_config = self._game_config.model_copy(update={"status": "question_finished"})

    def reveal_correct_answer(self, answer: str) -> None:
        with self._lock:
            self._answer_revealed = True
            self._revealed_correct_answer = answer

    def finish_game(self) -> None:
        with self._lock:
            self._game_finished = True
            self._question_finished = True
            self._question_accepting_presses = False
            self._game_status = "game_finished"
            if self._game_config is not None:
                self._game_config = self._game_config.model_copy(update={"status": "game_finished"})

    def game_runtime_snapshot(self) -> dict:
        with self._lock:
            game_config = self._game_config.model_copy(deep=True) if self._game_config else None
            current_question = self._current_question.model_copy(deep=True) if self._current_question else None
            current_team = None
            if self._current_team_id and self._game_config is not None:
                for team in self._game_config.teams:
                    if team.team_id == self._current_team_id:
                        current_team = team.model_copy(deep=True)
                        break
            press_queue = [press.model_copy(deep=True) for press in self._press_queue]
            teams = [team.model_copy(deep=True) for team in (self._game_config.teams if self._game_config else [])]
            
            press_history = list(self._press_history)
            press_times_by_team: Dict[str, List[float]] = {}
            for press in press_history:
                if press.team_id not in press_times_by_team:
                    press_times_by_team[press.team_id] = []
                press_times_by_team[press.team_id].append(press.elapsed_time)
            
            for team in teams:
                times = press_times_by_team.get(team.team_id, [])
                team.average_press_time = round(sum(times) / len(times), 2) if times else 0.0
                team.total_response_time = round(sum(times), 2) if times else 0.0

            ranking = sorted(
                teams,
                key=lambda item: (
                    -item.score,
                    item.total_response_time,
                    -item.correct_answers,
                    item.incorrect_answers,
                    item.name.lower(),
                ),
            )

            return {
                "game_status": self._game_status,
                "game_name": game_config.game_name if game_config else None,
                "visual_config": game_config.visual_config.model_dump(mode="json") if game_config else None,
                "question_time": game_config.question_time if game_config else 20,
                "question_remaining_time": self._question_remaining_time,
                "current_question_index": self._current_question_index,
                "total_questions": len(self._prepared_questions),
                "current_question": current_question.model_dump(mode="json") if current_question else None,
                "current_team": current_team.model_dump(mode="json") if current_team else None,
                "press_queue": [press.model_dump(mode="json") for press in press_queue],
                "blocked_teams_current_question": list(self._blocked_teams_current_question),
                "teams": [team.model_dump(mode="json") for team in teams],
                "scores": [team.model_dump(mode="json") for team in ranking],
                "question_mode": self._question_mode,
                "game_finished": self._game_finished,
                "game_uid": self._game_uid,
                "is_persisted": self._is_persisted,
                "question_finished": self._question_finished,
                "questions_loaded": self._questions_loaded,
                "total_bank_questions": self._total_questions,
                "answer_revealed": self._answer_revealed,
                "revealed_correct_answer": self._revealed_correct_answer,
                "is_paused": self._game_status == "game_paused",
                "game_pause_reason": self._game_pause_reason,
                "paused_from_status": self._paused_from_status,
            }

    def _update_team_locked(
        self,
        team_id: str,
        score_delta: int = 0,
        correct_delta: int = 0,
        incorrect_delta: int = 0,
        total_presses_delta: int = 0,
    ) -> Optional[Team]:
        if self._game_config is None:
            return None

        updated_teams: List[Team] = []
        updated_target: Optional[Team] = None
        for team in self._game_config.teams:
            if team.team_id != team_id:
                updated_teams.append(team)
                continue

            updated_target = team.model_copy(
                update={
                    "score": team.score + score_delta,
                    "correct_answers": team.correct_answers + correct_delta,
                    "incorrect_answers": team.incorrect_answers + incorrect_delta,
                    "total_presses": team.total_presses + total_presses_delta,
                }
            )
            updated_teams.append(updated_target)

        self._game_config = self._game_config.model_copy(update={"teams": updated_teams})
        return updated_target.model_copy(deep=True) if updated_target else None

    def _reset_runtime_locked(self) -> None:
        self._prepared_questions = []
        self._current_question_index = -1
        self._current_question = None
        self._current_team_id = None
        self._press_queue = []
        self._blocked_teams_current_question = set()
        self._question_started_at = None
        self._question_remaining_time = 0
        self._question_finished = False
        self._game_finished = False
        self._question_accepting_presses = False
        self._answer_revealed = False
        self._revealed_correct_answer = None
        self._game_pause_reason = None
        self._paused_from_status = None
        self._game_uid = None
        self._is_persisted = False
        self._score_adjustments = []

    def add_press_record(self, record: PressRecord) -> None:
        with self._lock:
            self._press_history.append(record)

    def add_answer_record(self, record: AnswerRecord) -> None:
        with self._lock:
            self._answer_history.append(record)

    def add_question_record(self, record: QuestionRecord) -> None:
        with self._lock:
            self._question_history.append(record)

    def press_history(self) -> List[PressRecord]:
        with self._lock:
            return list(self._press_history)

    def answer_history(self) -> List[AnswerRecord]:
        with self._lock:
            return list(self._answer_history)

    def question_history(self) -> List[QuestionRecord]:
        with self._lock:
            return list(self._question_history)

    def game_started_at(self) -> Optional[datetime]:
        with self._lock:
            return self._game_started_at

    def set_game_started_at(self, timestamp: datetime) -> None:
        with self._lock:
            self._game_started_at = timestamp

    def game_finished_at(self) -> Optional[datetime]:
        with self._lock:
            return self._game_finished_at

    def set_game_finished_at(self, timestamp: datetime) -> None:
        with self._lock:
            self._game_finished_at = timestamp

    def finalize_game(self) -> List[TeamResult]:
        now = self._now()
        press_history = list(self._press_history)
        
        with self._lock:
            if self._game_finished_at is None:
                self._game_finished_at = now

            if self._game_config is None:
                return []

            teams = list(self._game_config.teams)

        press_times_by_team: Dict[str, List[float]] = {}
        for press in press_history:
            if press.team_id not in press_times_by_team:
                press_times_by_team[press.team_id] = []
            press_times_by_team[press.team_id].append(press.elapsed_time)

        results: List[TeamResult] = []
        for idx, team in enumerate(teams):
            times = press_times_by_team.get(team.team_id, [])
            avg_time = sum(times) / len(times) if times else 0.0
            total_time = sum(times) if times else 0.0

            results.append(TeamResult(
                position=idx + 1,
                team_id=team.team_id,
                team_name=team.name,
                control_id=team.control_id,
                score=team.score,
                correct_answers=team.correct_answers,
                incorrect_answers=team.incorrect_answers,
                total_presses=team.total_presses,
                average_press_time=round(avg_time, 2),
                total_response_time=round(total_time, 2)
            ))

        results.sort(
            key=lambda x: (
                -x.score,
                x.total_response_time,
                -x.correct_answers,
                x.incorrect_answers,
                x.team_name.lower(),
            )
        )
        for idx, r in enumerate(results):
            r.position = idx + 1

        return results

    def game_uid(self) -> Optional[str]:
        with self._lock:
            return self._game_uid

    def is_persisted(self) -> bool:
        with self._lock:
            return self._is_persisted

    def mark_persisted(self, persisted: bool = True) -> None:
        with self._lock:
            self._is_persisted = persisted

    def score_adjustments(self) -> List[ScoreAdjustmentRecord]:
        with self._lock:
            return [item.model_copy(deep=True) for item in self._score_adjustments]


app_state = AppState()
