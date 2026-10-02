"""Typed API contracts and persisted records. No HTTP or Claude logic here."""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
NoteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
OptionalText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
EmailText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
UrlText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
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
    location: OptionalText = "Provo, UT"


class ContactCreate(Contract):
    name: ShortText
    how_met: OptionalText = ""
    company: OptionalText = ""
    role: OptionalText = ""
    phone: OptionalText = ""
    email: EmailText = ""
    last_contact: date | None = None
    notes: list[NoteText] = Field(default_factory=list, max_length=50)


class Contact(ContactCreate):
    id: str
    # Initial input is bounded; reflections can accumulate over time.
    notes: list[NoteText] = Field(default_factory=list)
    last_contact: date | None = None


class ContactUpdate(Contract):
    name: ShortText | None = None
    how_met: OptionalText | None = None
    company: OptionalText | None = None
    role: OptionalText | None = None
    phone: OptionalText | None = None
    email: EmailText | None = None
    last_contact: date | None = None
    notes: list[NoteText] | None = Field(default=None, max_length=50)


class TaskContext(Contract):
    """A bounded snapshot of the public opportunity selected during prep."""
    opportunity_id: ShortText
    kind: Literal["event", "person"]
    title: ShortText
    summary: NoteText
    why_it_fits: NoteText
    source_name: ShortText
    source_url: UrlText
    action_url: UrlText
    starts_at: str | None = Field(default=None, max_length=80)
    ends_at: str | None = Field(default=None, max_length=80)
    location: OptionalText = ""
    tags: list[ShortText] = Field(default_factory=list, max_length=10)


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
    prep_context: TaskContext | None = None


class TaskComplete(Contract):
    met_name: ShortText
    role: OptionalText = ""
    company: OptionalText = ""
    hook: NoteText
    # Explicit identity wins; otherwise match exact normalized name + company.
    contact_id: str | None = Field(default=None, max_length=100)


class TaskGuidance(Contract):
    objective: NoteText
    steps: list[ShortText] = Field(min_length=1, max_length=6)
    questions: list[ShortText] = Field(default_factory=list, max_length=5)
    script: OptionalText = ""
    external_hint: OptionalText = ""


class TaskPrepResponse(Contract):
    task: Task
    guidance: TaskGuidance
    contacts: list[Contact] = Field(default_factory=list)
    source: Source = "demo"


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


class RadarEntry(Contract):
    opportunity_id: ShortText
    saved_at: date


class Database(Contract):
    user: User
    contacts: list[Contact] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    game_sessions: list[GameSession] = Field(default_factory=list)
    active_sessions: dict[str, ActiveSession] = Field(default_factory=dict)
    radar: list[RadarEntry] = Field(default_factory=list)


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
    radar_ids: list[str] = Field(default_factory=list)


class ResearchCandidate(Contract):
    kind: Literal["event", "person"]
    title: ShortText
    summary: NoteText
    why_it_fits: NoteText
    source_name: ShortText
    source_url: UrlText
    action_url: UrlText
    starts_at: str | None = Field(default=None, max_length=80)
    ends_at: str | None = Field(default=None, max_length=80)
    location: OptionalText = ""
    tags: list[ShortText] = Field(default_factory=list, max_length=10)


class ResearchPayload(Contract):
    profile_summary: NoteText
    candidates: list[ResearchCandidate] = Field(default_factory=list, max_length=12)


class ResearchOpportunity(ResearchCandidate):
    id: ShortText
    on_radar: bool = False


class ResearchResponse(Contract):
    profile_summary: NoteText
    opportunities: list[ResearchOpportunity] = Field(default_factory=list, max_length=12)
    searched_at: date
    window_ends: date
    source: Source


class RadarResponse(Contract):
    opportunity_id: ShortText
    saved: bool
    radar_ids: list[str] = Field(default_factory=list)


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
