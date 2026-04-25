"""Data models for API payloads and in-memory state."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ControlState(BaseModel):
    device_id: str
    status: str = "unknown"
    last_seen: datetime


class EventRecord(BaseModel):
    timestamp: datetime
    device_id: str
    event_type: str
    topic: str
    payload: Dict[str, Any]
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    message: Optional[str] = None


class Team(BaseModel):
    team_id: str
    name: str
    control_id: str
    score: int = 0
    correct_answers: int = 0
    incorrect_answers: int = 0
    total_presses: int = 0
    is_active: bool = True


class GameConfig(BaseModel):
    game_name: str
    status: str = "configured"
    question_time: int = 20
    question_mode: Literal["ordered", "random"] = "ordered"
    teams: List[Team]


class Question(BaseModel):
    question_id: str
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: Literal["A", "B", "C", "D"]
    points: float
    category: Optional[str] = None
    difficulty: Optional[str] = None
    explanation: Optional[str] = None
    feedback: Optional[str] = None


class QuestionModeRequest(BaseModel):
    question_mode: Literal["ordered", "random"]


class ButtonPress(BaseModel):
    device_id: str
    team_id: str
    team_name: str
    question_id: str
    server_timestamp: datetime
    elapsed_time: float


class GameRuntime(BaseModel):
    game_status: str
    current_question: Optional[Question] = None
    current_team: Optional[Team] = None
    press_queue: List[ButtonPress] = Field(default_factory=list)
    question_remaining_time: int = 0


class LedCommandRequest(BaseModel):
    mode: Literal["on", "off", "blink_slow", "blink_fast"] = Field(
        description="LED mode to send to a control"
    )
