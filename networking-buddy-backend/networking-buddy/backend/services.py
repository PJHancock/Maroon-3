"""Application use cases. Business rules do not depend on FastAPI or Claude."""

import hashlib
import json
from collections import defaultdict
from collections.abc import Callable
from datetime import date, timedelta
from uuid import uuid4

from .db import Repository
from .errors import DomainError
from .games import GAME_CONFIGS, GameConfig, get_game
from .llm import NetworkingAI, validate_reminders, validate_rubric
from .models import (
    ActiveSession, Contact, ContactCreate, Database, DraftRequest, DraftResponse,
    GameSession, HistoryRequest, RemindersResponse, ScoreResponse, StartResponse,
    StateResponse, Task, TaskComplete, TaskResponse, TurnResponse, User,
)


def award_xp(user: User, amount: int, today: date) -> None:
    """One rule shared by games and real-world tasks."""
    if user.last_active == today - timedelta(days=1):
        user.streak += 1
    elif user.last_active != today:
        user.streak = 1
    user.last_active = today
    user.xp += amount


def normalize_identity(value: str) -> str:
    return " ".join(value.casefold().split())


class BuddyService:
    def __init__(self, repository: Repository, ai: NetworkingAI,
                 today: Callable[[], date], demo_mode: bool):
        self.repository = repository
        self.ai = ai
        self.today = today
        self.demo_mode = demo_mode

    def state(self) -> StateResponse:
        database = self.repository.load_db()
        return StateResponse(
            user=database.user, contacts=database.contacts,
            tasks=[t for t in database.tasks if t.status == "open"],
            game_sessions=sorted(reversed(database.game_sessions), key=lambda s: s.date, reverse=True)[:20],
            games=[config.public(name) for name, config in GAME_CONFIGS.items()],
            today=self.today(), mode="demo" if self.demo_mode else "live",
        )

    def reset(self) -> StateResponse:
        self.repository.reset_db()
        return self.state()

    async def start(self, name: str) -> StartResponse:
        game = get_game(name)
        answer = await self.ai.start(game)
        identifier = "g_" + uuid4().hex
        today = self.today()

        def commit(database: Database):
            while len(database.active_sessions) >= 100:
                database.active_sessions.pop(next(iter(database.active_sessions)))
            database.active_sessions[identifier] = ActiveSession(game=name, date=today)

        self.repository.update(commit)
        return StartResponse(**game.public(name).model_dump(), reply=answer.value,
                             session_id=identifier, source=answer.source)

    def _check_history(self, game: GameConfig, request: HistoryRequest, turn: bool = False) -> int:
        count = sum(m.role == "user" for m in request.history)
        if not 1 <= count <= game.max_turns:
            raise DomainError(f"This game requires 1–{game.max_turns} student messages", "invalid_turn_count", 422)
        if turn and game.max_turns == 1:
            raise DomainError("Single-turn games go directly to /score", "single_turn_game", 409)
        if turn and request.history[-1].role != "user":
            raise DomainError("End history with the new student message", "invalid_history", 422)
        return count

    def _check_session(self, database: Database, name: str, session_id: str | None) -> None:
        if session_id is None:
            return
        active = database.active_sessions.get(session_id)
        completed = next((s for s in database.game_sessions if s.id == session_id), None)
        session = active or completed
        if session is None:
            raise DomainError("Session not found; start a new game", "session_not_found", 404)
        if session.game != name:
            raise DomainError("Session belongs to another game", "session_game_mismatch", 409)

    async def turn(self, name: str, request: HistoryRequest) -> TurnResponse:
        game = get_game(name)
        count = self._check_history(game, request, turn=True)
        database = self.repository.load_db()
        self._check_session(database, name, request.session_id)
        if request.session_id and any(s.id == request.session_id for s in database.game_sessions):
            raise DomainError("Session has already been scored", "session_completed", 409)
        answer = await self.ai.turn(game, request.history)
        return TurnResponse(reply=answer.value, turns_used=count,
                            turns_remaining=game.max_turns - count,
                            game_complete=count == game.max_turns, source=answer.source)

    async def score(self, name: str, request: HistoryRequest) -> ScoreResponse:
        game = get_game(name)
        self._check_history(game, request)
        today = self.today()
        fingerprint = hashlib.sha256(json.dumps(
            {"game": name, "date": today.isoformat(),
             "history": [m.model_dump() for m in request.history]},
            sort_keys=True, ensure_ascii=False,
        ).encode()).hexdigest()
        # Old clients need only history. New clients can repeat identical practice
        # by using a fresh session_id; retries of one session remain idempotent.
        identifier = request.session_id or "legacy_" + fingerprint

        def previous(database: Database) -> ScoreResponse | None:
            self._check_session(database, name, request.session_id)
            completed = next((s for s in database.game_sessions if s.id == identifier), None)
            if completed is not None:
                if completed.feedback is None:
                    raise DomainError("Seeded history is read-only; start a new game", "session_completed", 409)
                return ScoreResponse(**completed.feedback.model_dump(), xp=completed.xp,
                                     xp_awarded=0, user=database.user, session_id=completed.id,
                                     already_scored=True, source=completed.source)
            return None

        cached = previous(self.repository.load_db())
        if cached:
            return cached
        answer = await self.ai.score(game, request.history)
        validate_rubric(answer.value, game)

        def commit(database: Database) -> ScoreResponse:
            # Re-read and recheck after the model call: another request may have
            # finished first, or the demo may have been reset in the meantime.
            cached = previous(database)
            if cached:
                return cached
            session = GameSession(id=identifier, game=name, date=today,
                                  scores=answer.value.scores, xp=game.xp,
                                  history=request.history, feedback=answer.value,
                                  source=answer.source, fingerprint=fingerprint)
            database.game_sessions.append(session)
            database.active_sessions.pop(identifier, None)
            award_xp(database.user, game.xp, today)
            return ScoreResponse(**answer.value.model_dump(), xp=game.xp, xp_awarded=game.xp,
                                 user=database.user, session_id=identifier,
                                 already_scored=False, source=answer.source)

        return self.repository.update(commit)

    def add_contact(self, request: ContactCreate) -> Contact:
        contact = Contact(**request.model_dump(), id="c_" + uuid4().hex,
                          last_contact=self.today())

        def commit(database: Database):
            database.contacts.append(contact)
            return contact

        return self.repository.update(commit)

    def _reflection_contact(self, database: Database, task: Task, request: TaskComplete) -> Contact:
        identifier = request.contact_id or task.contact_id
        if identifier:
            contact = next((c for c in database.contacts if c.id == identifier), None)
            if contact is None:
                raise DomainError("Contact not found", "contact_not_found", 404)
            if normalize_identity(contact.name) != normalize_identity(request.met_name):
                raise DomainError("The name doesn't match this contact_id", "contact_name_mismatch", 409)
        else:
            matches = [c for c in database.contacts
                       if normalize_identity(c.name) == normalize_identity(request.met_name)
                       and normalize_identity(c.company) == normalize_identity(request.company)]
            if len(matches) > 1:
                raise DomainError("Multiple matching contacts; include contact_id", "ambiguous_contact", 409)
            contact = matches[0] if matches else None
        if contact is None:
            contact = Contact(id="c_" + uuid4().hex, name=request.met_name,
                              how_met=task.title, company=request.company, role=request.role)
            database.contacts.append(contact)
        if request.company:
            contact.company = request.company
        if request.role:
            contact.role = request.role
        if request.hook not in contact.notes:
            contact.notes.append(request.hook)
        contact.last_contact = self.today()
        return contact

    def complete_task(self, identifier: str, request: TaskComplete) -> TaskResponse:
        def commit(database: Database):
            task = next((t for t in database.tasks if t.id == identifier), None)
            if task is None:
                raise DomainError("Task not found", "task_not_found", 404)
            already = task.status == "completed"
            if already:
                contact = next((c for c in database.contacts if c.id == task.contact_id), None)
                if contact is None:
                    raise DomainError("Completed task has no contact", "invalid_task_state", 409)
            else:
                contact = self._reflection_contact(database, task, request)
                task.status = "completed"
                task.completed_at = self.today()
                task.contact_id = contact.id
                task.reflection = request.model_dump(exclude={"contact_id"})
                award_xp(database.user, task.xp, self.today())
            return TaskResponse(contact=contact, task=task, xp=task.xp,
                                xp_awarded=0 if already else task.xp,
                                user=database.user, already_completed=already)

        return self.repository.update(commit)

    def _coach_context(self, database: Database) -> dict:
        values = defaultdict(list)
        for session in database.game_sessions:
            for dimension, value in session.scores.items():
                values[dimension].append(value)
        return {
            "today": self.today().isoformat(),
            "user": database.user.model_dump(mode="json"),
            "contacts": [c.model_dump(mode="json") for c in database.contacts],
            "completed_tasks": [t.model_dump(mode="json") for t in database.tasks if t.status == "completed"],
            "score_averages": {key: round(sum(scores) / len(scores), 2) for key, scores in values.items()},
        }

    async def reminders(self) -> RemindersResponse:
        context = self._coach_context(self.repository.load_db())
        answer = await self.ai.reminders(context)
        validate_reminders(answer.value, context)
        return RemindersResponse(**answer.value.model_dump(), source=answer.source)

    async def draft(self, request: DraftRequest) -> DraftResponse:
        database = self.repository.load_db()
        contact = next((c for c in database.contacts if c.id == request.contact_id), None)
        if contact is None:
            raise DomainError("Contact not found", "contact_not_found", 404)
        context = {"user": database.user.model_dump(mode="json"),
                   "contact": contact.model_dump(mode="json"), "reason": request.reason,
                   "today": self.today().isoformat()}
        answer = await self.ai.draft(context)
        return DraftResponse(draft=answer.value, contact_id=contact.id, source=answer.source)
