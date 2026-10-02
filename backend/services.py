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
    ActiveSession, Contact, ContactCreate, ContactUpdate, Database, DraftRequest,
    DraftResponse, GameSession, HistoryRequest, OnboardingRequest, RadarEntry, RadarItem,
    RadarListResponse, RadarResponse, ResearchCandidate,
    RemindersResponse, ResearchResponse, ScoreResponse, StartResponse,
    StateResponse, SuggestionsResponse, Task, TaskAcceptRequest, TaskComplete,
    TaskContext, TaskGuidance, TaskPrepResponse, TaskProposalResponse, TaskResponse,
    TurnResponse, User,
)
from .research import normalize_candidates, profile_context, research_fingerprint


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


TASK_GUIDANCE = {
    "in_person": {
        "objective": "Have one genuine conversation and leave with one specific detail to remember.",
        "steps": [
            "Choose a nearby place or event where your target community already gathers.",
            "Introduce yourself with your school, interest, and one clear reason for being there.",
            "Ask one open question and listen for a detail you can reference later.",
            "Before leaving, ask whether a low-pressure follow-up would be welcome.",
        ],
        "questions": [
            "What kind of work has been taking most of your attention lately?",
            "How did you get into this part of the field?",
            "What would you recommend I learn or try next?",
        ],
        "external_hint": "Look for a current event or community where data and technology professionals gather.",
    },
    "event": {
        "objective": "Attend a relevant event and have one conversation with someone whose work interests you.",
        "steps": [
            "Pick an event that fits your role interests and schedule.",
            "Review the event details and prepare one specific question.",
            "Arrive early enough to introduce yourself before the room gets busy.",
            "Write down one detail about the person or team before you leave.",
        ],
        "questions": [
            "What brought you to this event?",
            "What problem is your team working on right now?",
            "What is one skill that helps someone contribute quickly on your team?",
        ],
        "external_hint": "Find a current campus, meetup, or professional event within the next 90 days.",
    },
    "personal_chat": {
        "objective": "Set up a short conversation that helps you learn about someone’s path and creates a natural next step.",
        "steps": [
            "Choose someone whose experience connects to your current goal.",
            "Invite them to a specific 15-minute time window.",
            "Bring two questions and let their answers guide the conversation.",
            "End by naming one thing you learned and a reasonable follow-up.",
        ],
        "questions": [
            "What does a normal week look like in your role?",
            "What helped you move from learning to doing this work professionally?",
            "Is there a small project or resource you would recommend?",
        ],
        "script": "Would you be open to a 15-minute chat next week? I’d love to ask about your path into this work.",
    },
    "call": {
        "objective": "Make a real call with a clear reason for reconnecting and a small next step.",
        "steps": [
            "Choose a contact you have a genuine reason to call.",
            "Open with why you are calling and ask whether they have a minute.",
            "Ask one focused question instead of trying to cover everything.",
            "If they miss the call, leave the reason and an easy way to respond.",
        ],
        "questions": [
            "What has changed since we last talked?",
            "Could I ask you one quick question about your experience?",
        ],
        "script": "Hi, it’s [your name]. I was thinking about what you shared about [specific detail]. I had one quick question and would love to reconnect when you have a minute.",
    },
    "online_outreach": {
        "objective": "Send one specific, low-pressure message to a new person whose work you genuinely want to understand.",
        "steps": [
            "Choose someone whose recent work connects to your target role.",
            "Read enough to reference one specific project or idea.",
            "Ask one focused question that can be answered briefly.",
            "Make the next step optional and easy to decline.",
        ],
        "questions": [
            "What part of your work has been most interesting recently?",
            "What would you suggest a student build to understand this field better?",
        ],
        "script": "Hi! I’m a student exploring [role]. Your work on [specific project] caught my attention. Could I ask one quick question about how you got started?",
        "external_hint": "Use the personalized people results or search LinkedIn for a role, school, or community near you.",
    },
    "follow_up": {
        "objective": "Reconnect using something the person actually shared instead of sending a generic check-in.",
        "steps": [
            "Choose the person and reread your saved notes.",
            "Lead with the specific detail you remember.",
            "Share a small update, question, or useful resource.",
            "End with a low-pressure next step.",
        ],
        "questions": [
            "How did the project or deadline you mentioned turn out?",
            "Would it be useful if I sent you the small project I mentioned?",
        ],
        "script": "Hi! I was thinking about what you shared about [specific detail]. I wanted to ask how it turned out and share a quick update from my side.",
    },
}


def task_guidance(task: Task) -> TaskGuidance:
    values = TASK_GUIDANCE.get(task.type, TASK_GUIDANCE["in_person"])
    return TaskGuidance(**values)


class BuddyService:
    def __init__(self, repository: Repository, ai: NetworkingAI,
                 today: Callable[[], date], demo_mode: bool):
        self.repository = repository
        self.ai = ai
        self.today = today
        self.demo_mode = demo_mode
        self._research_cache: dict[str, ResearchResponse] = {}

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
            radar_ids=[entry.opportunity_id for entry in database.radar],
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
        self._research_cache.clear()
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

    def update_contact(self, identifier: str, request: ContactUpdate) -> Contact:
        if request.last_contact and request.last_contact > self.today():
            raise DomainError("The contact date cannot be in the future", "future_contact_date", 422)

        def commit(database: Database):
            contact = next((c for c in database.contacts if c.id == identifier), None)
            if contact is None:
                raise DomainError("Contact not found", "contact_not_found", 404)
            for field, value in request.model_dump(exclude_unset=True).items():
                setattr(contact, field, value)
            return contact

        result = self.repository.update(commit)
        self._research_cache.clear()
        return result

    def delete_contact(self, identifier: str) -> dict[str, str]:
        def commit(database: Database):
            index = next((i for i, c in enumerate(database.contacts) if c.id == identifier), None)
            if index is None:
                raise DomainError("Contact not found", "contact_not_found", 404)
            database.contacts.pop(index)
            # Preserve completed interaction reflections, but remove dangling
            # foreign keys so future task retries cannot resurrect the contact.
            for task in database.tasks:
                if task.contact_id == identifier:
                    task.contact_id = None
            return {"deleted": identifier}

        result = self.repository.update(commit)
        self._research_cache.clear()
        return result

    def task_prep(self, identifier: str) -> TaskPrepResponse:
        database = self.repository.load_db()
        task = next((item for item in database.tasks if item.id == identifier), None)
        if task is None:
            raise DomainError("Task not found", "task_not_found", 404)
        if task.status != "open":
            raise DomainError("You already finished this task", "task_completed", 409)
        return TaskPrepResponse(
            task=task,
            guidance=task_guidance(task),
            contacts=database.contacts,
            source="demo" if self.demo_mode else "live",
        )

    def set_task_context(self, identifier: str, context: TaskContext) -> Task:
        def commit(database: Database):
            task = next((item for item in database.tasks if item.id == identifier), None)
            if task is None:
                raise DomainError("Task not found", "task_not_found", 404)
            if task.status != "open":
                raise DomainError("You already finished this task", "task_completed", 409)
            task.prep_context = context
            return task

        return self.repository.update(commit)

    def clear_task_context(self, identifier: str) -> Task:
        def commit(database: Database):
            task = next((item for item in database.tasks if item.id == identifier), None)
            if task is None:
                raise DomainError("Task not found", "task_not_found", 404)
            if task.status != "open":
                raise DomainError("You already finished this task", "task_completed", 409)
            task.prep_context = None
            return task

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
                database.tasks.append(Task(
                    id="t_" + uuid4().hex, title=f"Follow up with {contact.name}",
                    description=f"Reconnect about: {request.hook[:120]}",
                    type="follow_up", difficulty="easy", xp=40,
                    contact_id=contact.id, frequency="once", skill="follow up",
                ))
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
            if request.name:
                database.user.name = request.name
            if request.university:
                database.user.school = request.university
            if request.major:
                database.user.major = request.major
            if request.location:
                database.user.location = request.location
            database.user.target_company = request.target_company
            if request.target_roles:
                database.user.target_roles = request.target_roles
            elif request.target_role:
                database.user.target_roles = [request.target_role]
            database.user.resume_text = request.resume_text
            database.user.personal_projects = request.personal_projects
            database.user.existing_connections = request.existing_connections
            database.user.interests = request.interests
            database.user.onboarding_goal = request.goal
            database.user.onboarding_complete = True
            role = request.target_role or (database.user.target_roles[0] if database.user.target_roles else "your target role")
            company = request.target_company or "a company you admire"
            if request.goal == "job":
                templates = [
                    (f"Research the {role} role", f"Find 3 job postings for {role} and note what skills they require.", "online_outreach", "easy", 30, "research"),
                    (f"Find someone working as a {role}", "Look on LinkedIn or your network for someone in this role to learn from.", "online_outreach", "easy", 35, "outreach"),
                    ("Schedule an informational interview", "Invite someone in your target role to a 15-minute conversation.", "personal_chat", "medium", 60, "informational interview"),
                    ("Practice your elevator pitch", f"Prepare a 30-second introduction for a {role} conversation.", "in_person", "easy", 30, "elevator pitch"),
                ]
            elif request.goal == "company":
                templates = [
                    (f"Research {company}", f"Learn about {company}'s tech stack, culture, and open roles.", "online_outreach", "easy", 30, "research"),
                    (f"Find someone who works at {company}", f"Look for an employee at {company} whose work interests you.", "online_outreach", "easy", 35, "outreach"),
                    (f"Reach out to a {company} employee", "Send a specific, low-pressure question about their experience.", "online_outreach", "medium", 50, "outreach"),
                    (f"Schedule an informational interview at {company}", f"Ask someone at {company} for a 15-minute conversation.", "call", "medium", 60, "informational interview"),
                ]
            else:
                templates = [
                    ("Introduce yourself to someone new", "Meet one new person at school, work, or an event this week.", "in_person", "easy", 50, "introductions"),
                    ("Contact someone new every week", "Reach out to one person in your field each week.", "online_outreach", "easy", 35, "outreach"),
                    ("Attend a campus or community event", "Go to a meetup, info session, or career event and talk to someone.", "event", "hard", 80, "events"),
                    ("Set up a coffee chat", "Invite a mentor, classmate, or professional to a short conversation.", "personal_chat", "medium", 60, "coffee chat"),
                ]
            database.tasks.extend(Task(
                id="t_" + uuid4().hex, title=title, description=description,
                type=kind, difficulty=difficulty, xp=xp, skill=skill,
            ) for title, description, kind, difficulty, xp, skill in templates)

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
        answer = await self.ai.propose_tasks(self._coach_context(database))
        tasks = [Task(
            id="t_" + uuid4().hex, title=item.get("title", "Networking task"),
            description=item.get("description", ""), type=item.get("type", "online_outreach"),
            difficulty=item.get("difficulty", "medium"), xp=max(10, min(100, int(item.get("xp", 40)))),
            frequency=item.get("frequency", "once"), skill=item.get("skill", ""),
            contact_id=item.get("contact_id"),
        ) for item in answer.value]

        def commit(database: Database):
            database.proposed_tasks = tasks

        self.repository.update(commit)
        return TaskProposalResponse(proposed_tasks=tasks, source=answer.source)

    def accept_task(self, identifier: str, request: TaskAcceptRequest) -> Task:
        def commit(database: Database):
            task = next((item for item in database.proposed_tasks if item.id == identifier), None)
            if task is None:
                raise DomainError("Proposed task not found", "task_not_found", 404)
            database.proposed_tasks = [item for item in database.proposed_tasks if item.id != identifier]
            task.frequency = request.frequency
            database.tasks.append(task)
            return task

        return self.repository.update(commit)

    def reject_task(self, identifier: str) -> dict[str, bool]:
        def commit(database: Database):
            if not any(item.id == identifier for item in database.proposed_tasks):
                raise DomainError("Proposed task not found", "task_not_found", 404)
            database.proposed_tasks = [item for item in database.proposed_tasks if item.id != identifier]
            return {"ok": True}

        return self.repository.update(commit)

    async def opportunities(self, refresh: bool = False) -> ResearchResponse:
        database = self.repository.load_db()
        context = profile_context(database, self.today())
        key = research_fingerprint(context)
        if not refresh and key in self._research_cache:
            cached = self._research_cache[key]
            radar_ids = {entry.opportunity_id for entry in database.radar}
            return cached.model_copy(update={
                "opportunities": [item.model_copy(update={"on_radar": item.id in radar_ids})
                                  for item in cached.opportunities],
            })
        answer = await self._ai_call(self.ai.research, context=context)
        opportunities = normalize_candidates(
            answer.value, self.today(), {entry.opportunity_id for entry in database.radar},
        )
        response = ResearchResponse(
            profile_summary=answer.value.profile_summary,
            opportunities=opportunities,
            searched_at=self.today(),
            window_ends=self.today() + timedelta(days=90),
            source=answer.source,
        )
        self._research_cache[key] = response
        return response

    async def set_radar(self, identifier: str, saved: bool) -> RadarResponse:
        snapshot = None
        if saved:
            results = await self.opportunities()
            found = next((item for item in results.opportunities if item.id == identifier), None)
            if found is None:
                raise DomainError("Research opportunity not found; refresh recommendations", "opportunity_not_found", 404)
            snapshot = ResearchCandidate(**found.model_dump(exclude={"id", "on_radar"}))

        def commit(database: Database):
            existing = next((entry for entry in database.radar if entry.opportunity_id == identifier), None)
            if saved and existing is None:
                database.radar.append(RadarEntry(opportunity_id=identifier, saved_at=self.today(), opportunity=snapshot))
            elif saved and existing.opportunity is None:
                existing.opportunity = snapshot  # backfill entries saved before snapshots existed
            elif not saved and existing is not None:
                database.radar.remove(existing)
            return RadarResponse(
                opportunity_id=identifier,
                saved=saved,
                radar_ids=[entry.opportunity_id for entry in database.radar],
            )

        result = self.repository.update(commit)
        return result

    def radar(self) -> RadarListResponse:
        """Saved opportunities: events by start date, then people and communities."""
        database = self.repository.load_db()
        items = [
            RadarItem(**entry.opportunity.model_dump(), id=entry.opportunity_id, saved_at=entry.saved_at)
            for entry in database.radar if entry.opportunity is not None
        ]
        items.sort(key=lambda item: (item.kind != "event", item.starts_at or "9999", item.title.casefold()))
        unavailable = sum(1 for entry in database.radar if entry.opportunity is None)
        return RadarListResponse(items=items, today=self.today(), unavailable=unavailable)
