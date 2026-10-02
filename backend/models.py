"""Typed API contracts and persisted records. No HTTP or Claude logic here."""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
NoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Source = Literal["demo", "live", "fallback"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class User(Contract):
    name: ShortText
    school: ShortText
    major: ShortText
    target_roles: list[ShortText]
    xp: int = Field(ge=0)
    streak: int = Field(ge=0)
    last_active: date | None = None
    today_connection_done: bool = False


class ContactCreate(Contract):
    name: ShortText
    how_met: OptionalText = ""
    company: OptionalText = ""
    role: OptionalText = ""
    phone: OptionalText = ""
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    last_contact: date | None = None
    notes: list[NoteText] = Field(default_factory=list, max_length=50)


class Contact(ContactCreate):
    id: str
    # Initial input is bounded; reflections can accumulate over time.
    notes: list[NoteText] = Field(default_factory=list)
    last_contact: date | None = None


class Task(Contract):
    id: str
    title: str
    description: OptionalText = ""
    type: Literal["in_person", "event", "personal_chat", "call", "online_outreach", "follow_up"] = "in_person"
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    location: OptionalText = ""
    event_search: bool = False
    xp: int = Field(ge=0)
    status: Literal["open", "completed"] = "open"
    completed_at: date | None = None
    contact_id: str | None = None
    reflection: dict[str, str] | None = None


class TaskComplete(Contract):
    met_name: ShortText
    role: OptionalText = ""
    company: OptionalText = ""
    hook: NoteText
    # Explicit identity wins; otherwise match exact normalized name + company.
    contact_id: str | None = Field(default=None, max_length=100)


class Message(Contract):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class HistoryRequest(Contract):
    history: list[Message] = Field(min_length=1, max_length=25)
    session_id: str | None = Field(default=None, min_length=1, max_length=100)
    context: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def alternating_messages(self):
        for left, right in zip(self.history, self.history[1:]):
            if left.role == right.role:
                raise ValueError("History must alternate user and assistant messages")
        if sum(len(m.content) for m in self.history) > 24000:
            raise ValueError("History is limited to 24,000 characters")
        return self


class DraftRequest(Contract):
    contact_id: str = Field(min_length=1, max_length=100)
    reason: NoteText


class ScoreFeedback(Contract):
    scores: dict[str, Annotated[int, Field(strict=True, ge=1, le=5)]]
    best_moment: NoteText
    one_fix: NoteText
    rewrite_example: NoteText
    recommended_follow_up: OptionalText = ""


class GameSession(Contract):
    id: str
    game: str
    date: date
    scores: dict[str, int]
    xp: int
    history: list[Message] = Field(default_factory=list)
    feedback: ScoreFeedback | None = None
    source: Source = "demo"
    fingerprint: str | None = None


class ActiveSession(Contract):
    game: str
    date: date


class Database(Contract):
    user: User
    contacts: list[Contact] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    game_sessions: list[GameSession] = Field(default_factory=list)
    active_sessions: dict[str, ActiveSession] = Field(default_factory=dict)


class GameInfo(Contract):
    game: str
    title: str
    goal: str
    max_turns: int
    xp: int
    rubric: list[str]


class StateResponse(Contract):
    user: User
    contacts: list[Contact]
    tasks: list[Task]
    game_sessions: list[GameSession]
    games: list[GameInfo]
    today: date
    mode: Literal["demo", "live"]


class StartResponse(GameInfo):
    reply: str
    session_id: str
    source: Source


class TurnResponse(Contract):
    reply: str
    turns_used: int
    turns_remaining: int
    game_complete: bool
    source: Source


class ScoreResponse(ScoreFeedback):
    xp: int
    xp_awarded: int
    user: User
    session_id: str
    already_scored: bool
    source: Source


class TaskResponse(Contract):
    contact: Contact
    task: Task
    xp: int
    xp_awarded: int
    user: User
    already_completed: bool


class Reminder(Contract):
    contact_id: str = Field(min_length=1, max_length=100)
    headline: ShortText
    reason: NoteText
    suggested_action: NoteText
    tip: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""

    @model_validator(mode="after")
    def short_headline(self):
        if len(self.headline.split()) > 7:
            raise ValueError("Headlines must be under 8 words")
        return self


class ReminderPayload(Contract):
    reminders: list[Reminder] = Field(max_length=3)


class RemindersResponse(ReminderPayload):
    source: Source


class DraftResponse(Contract):
    draft: str
    contact_id: str
    source: Source
