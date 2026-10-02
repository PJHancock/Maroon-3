"""Application use cases. Business rules do not depend on FastAPI or Claude."""

import hashlib
import inspect
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
    GameSession, HistoryRequest, OnboardingRequest, RemindersResponse, ScoreResponse,
    StartResponse, StateResponse, SuggestionsResponse, Task, TaskAcceptRequest,
    TaskComplete, TaskProposalResponse, TaskResponse, TurnResponse, User,
)


def award_xp(user: User, amount: int, today: date) -> None:
    """One rule shared by games and real-world tasks."""
    if user.last_active == today - timedelta(days=1):
        user.streak += 1
    elif user.last_active != today:
        user.streak = 1
    user.last_active = today
    user.xp += amount
    user.today_connection_done = True


def normalize_identity(value: str) -> str:
    return " ".join(value.casefold().split())


class BuddyService:
    def __init__(self, repository: Repository, ai: NetworkingAI,
                 today: Callable[[], date], demo_mode: bool):
        self.repository = repository
        self.ai = ai
        self.today = today
        self.demo_mode = demo_mode

    async def _ai_call(self, method, *args, context: dict):
        # Keep compatibility with simple test/demonstration AI doubles that
        # implement the original two-argument interface.
        if "context" in inspect.signature(method).parameters:
            return await method(*args, context=context)
        return await method(*args)

    def state(self) -> StateResponse:
        database = self.repository.load_db()
        return StateResponse(
            user=database.user, contacts=database.contacts,
            tasks=[t for t in database.tasks if t.status == "open"],
            proposed_tasks=database.proposed_tasks,
            game_sessions=sorted(reversed(database.game_sessions), key=lambda s: s.date, reverse=True)[:20],
            games=[config.public(name) for name, config in GAME_CONFIGS.items()],
            today=self.today(), mode="demo" if self.demo_mode else "live",
        )

    def _game_context(self, database: Database) -> dict:
        return {
            "today": self.today().isoformat(),
            "user": database.user.model_dump(mode="json"),
            "contacts": [c.model_dump(mode="json") for c in database.contacts[:8]],
            "open_tasks": [t.model_dump(mode="json") for t in database.tasks if t.status == "open"][:8],
            "recent_game_sessions": [s.model_dump(mode="json") for s in database.game_sessions[-5:]],
        }

    def reset(self) -> StateResponse:
        self.repository.reset_db()
        return self.state()

    async def start(self, name: str) -> StartResponse:
        game = get_game(name)
        answer = await self._ai_call(self.ai.start, game, context=self._game_context(self.repository.load_db()))
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
        answer = await self._ai_call(self.ai.turn, game, request.history, context=self._game_context(database))
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
        answer = await self._ai_call(self.ai.score, game, request.history, context=self._game_context(self.repository.load_db()))
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
        if request.last_contact and request.last_contact > self.today():
            raise DomainError("The contact date cannot be in the future", "future_contact_date", 422)
        values = request.model_dump()
        values["last_contact"] = request.last_contact or self.today()
        contact = Contact(**values, id="c_" + uuid4().hex)

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
                # Auto-generate follow-up task for this contact.
                follow_up = Task(
                    id="t_" + uuid4().hex, title=f"Follow up with {contact.name}",
                    description=f"Reconnect about: {request.hook[:120]}",
                    type="follow_up", difficulty="easy", xp=40,
                    contact_id=contact.id, frequency="once", skill="follow up",
                )
                database.tasks.append(follow_up)
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

    def complete_onboarding(self, request: OnboardingRequest) -> StateResponse:
        def commit(database: Database):
            database.user.onboarding_goal = request.goal
            role = request.target_role or (database.user.target_roles[0] if database.user.target_roles else "your target role")
            company = request.target_company or "a company you admire"
            templates = []
            if request.goal == "job":
                templates = [
                    Task(id="t_" + uuid4().hex, title=f"Research the {role} role",
                         description=f"Find 3 job postings for {role} and note what skills they require.",
                         type="online_outreach", difficulty="easy", xp=30, skill="research"),
                    Task(id="t_" + uuid4().hex, title=f"Find someone working as a {role}",
                         description="Look on LinkedIn or your network for someone in this role to learn from.",
                         type="online_outreach", difficulty="easy", xp=35, skill="outreach"),
                    Task(id="t_" + uuid4().hex, title="Schedule an informational interview",
                         description="Invite someone in your target role to a 15-minute conversation.",
                         type="personal_chat", difficulty="medium", xp=60, skill="informational interview"),
                    Task(id="t_" + uuid4().hex, title="Practice your elevator pitch",
                         description=f"Prepare a 30-second introduction for a {role} conversation.",
                         type="in_person", difficulty="easy", xp=30, skill="elevator pitch"),
                    Task(id="t_" + uuid4().hex, title="Start a related personal project",
                         description=f"Build something small related to {role} to discuss in conversations.",
                         type="in_person", difficulty="hard", xp=60, skill="portfolio"),
                    Task(id="t_" + uuid4().hex, title="Contact someone new every week",
                         description=f"Reach out to one person working in {role} each week.",
                         type="online_outreach", difficulty="easy", xp=35, frequency="weekly", skill="outreach"),
                ]
            elif request.goal == "company":
                templates = [
                    Task(id="t_" + uuid4().hex, title=f"Research {company}",
                         description=f"Learn about {company}'s tech stack, culture, and open roles.",
                         type="online_outreach", difficulty="easy", xp=30, skill="research"),
                    Task(id="t_" + uuid4().hex, title=f"Find someone who works at {company}",
                         description=f"Look for an employee at {company} whose work interests you.",
                         type="online_outreach", difficulty="easy", xp=35, skill="outreach"),
                    Task(id="t_" + uuid4().hex, title=f"Reach out to a {company} employee",
                         description="Send a specific, low-pressure question about their experience.",
                         type="online_outreach", difficulty="medium", xp=50, skill="outreach"),
                    Task(id="t_" + uuid4().hex, title=f"Learn tools or libraries {company} uses",
                         description=f"Research what {company} uses and try building something small with it.",
                         type="online_outreach", difficulty="medium", xp=40, skill="research"),
                    Task(id="t_" + uuid4().hex, title=f"Start a project related to {company}'s work",
                         description=f"Build a small project that shows skills relevant to {company}.",
                         type="in_person", difficulty="hard", xp=60, skill="portfolio"),
                    Task(id="t_" + uuid4().hex, title=f"Schedule an informational interview at {company}",
                         description=f"Ask someone at {company} for a 15-minute conversation.",
                         type="call", difficulty="medium", xp=60, skill="informational interview"),
                ]
            else:  # general
                templates = [
                    Task(id="t_" + uuid4().hex, title="Introduce yourself to someone new",
                         description="Meet one new person at school, work, or an event this week.",
                         type="in_person", difficulty="easy", xp=50, skill="introductions"),
                    Task(id="t_" + uuid4().hex, title="Contact someone new every week",
                         description="Reach out to one person in your field each week.",
                         type="online_outreach", difficulty="easy", xp=35, frequency="weekly", skill="outreach"),
                    Task(id="t_" + uuid4().hex, title="Attend a campus or community event",
                         description="Go to a meetup, info session, or career event and talk to someone.",
                         type="event", difficulty="hard", xp=80, skill="events"),
                    Task(id="t_" + uuid4().hex, title="Set up a coffee chat",
                         description="Invite a mentor, classmate, or professional to a short conversation.",
                         type="personal_chat", difficulty="medium", xp=60, skill="coffee chat"),
                    Task(id="t_" + uuid4().hex, title="Practice your elevator pitch",
                         description="Prepare and practice a 30-second introduction about yourself.",
                         type="in_person", difficulty="easy", xp=30, skill="elevator pitch"),
                    Task(id="t_" + uuid4().hex, title="Start a personal project to discuss",
                         description="Build something small you can bring up in networking conversations.",
                         type="in_person", difficulty="hard", xp=50, skill="portfolio"),
                ]
            database.tasks.extend(templates)

        self.repository.update(commit)
        return self.state()

    async def suggest(self, request: DraftRequest) -> SuggestionsResponse:
        database = self.repository.load_db()
        contact = next((c for c in database.contacts if c.id == request.contact_id), None)
        if contact is None:
            raise DomainError("Contact not found", "contact_not_found", 404)
        context = {"user": database.user.model_dump(mode="json"),
                   "contact": contact.model_dump(mode="json"), "reason": request.reason,
                   "today": self.today().isoformat()}
        answer = await self.ai.suggest(context)
        return SuggestionsResponse(suggestions=answer.value, contact_id=contact.id, source=answer.source)

    async def propose_tasks(self) -> TaskProposalResponse:
        database = self.repository.load_db()
        context = self._coach_context(database)
        answer = await self.ai.propose_tasks(context)
        tasks = []
        for t in answer.value:
            tasks.append(Task(
                id="t_" + uuid4().hex, title=t.get("title", "Networking task"),
                description=t.get("description", ""), type=t.get("type", "online_outreach"),
                difficulty=t.get("difficulty", "medium"), xp=max(10, min(100, int(t.get("xp", 40)))),
                frequency=t.get("frequency", "once"), skill=t.get("skill", ""),
                contact_id=t.get("contact_id"),
            ))

        def commit(database: Database):
            database.proposed_tasks = tasks

        self.repository.update(commit)
        return TaskProposalResponse(proposed_tasks=tasks, source=answer.source)

    def accept_task(self, identifier: str, request: TaskAcceptRequest) -> Task:
        def commit(database: Database):
            task = next((t for t in database.proposed_tasks if t.id == identifier), None)
            if task is None:
                raise DomainError("Proposed task not found", "task_not_found", 404)
            database.proposed_tasks = [t for t in database.proposed_tasks if t.id != identifier]
            task.frequency = request.frequency
            database.tasks.append(task)
            return task

        return self.repository.update(commit)

    def reject_task(self, identifier: str) -> dict:
        def commit(database: Database):
            task = next((t for t in database.proposed_tasks if t.id == identifier), None)
            if task is None:
                raise DomainError("Proposed task not found", "task_not_found", 404)
            database.proposed_tasks = [t for t in database.proposed_tasks if t.id != identifier]

        self.repository.update(commit)
        return {"ok": True}
