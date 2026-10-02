"""Saved golden-path responses plus grounded, deterministic offline fallbacks.

These are scripted practice examples, not real model evaluations. They also
keep arbitrary frontend inputs usable during integration without a paid key.
"""

import re
from dataclasses import dataclass
from typing import Generic, TypeVar

from .games import GameConfig
from .models import Message, Reminder, ReminderPayload, ResearchPayload, ScoreFeedback, Source

T = TypeVar("T")


@dataclass(frozen=True)
class AIResult(Generic[T]):
    value: T
    source: Source


DEMO_COFFEE_LINES = (
    "I'm a BYU CS junior interested in data engineering. What does your team work on?",
    "What does a typical day look like?",
    "What skills would you recommend I practice?",
    "Thanks for the advice! Could I send you a small project next week?",
)

COFFEE_REPLIES = (
    "We build pipelines that make product data useful for analysts. We're moving transformations into dbt, and keeping models reliable is a big part of my week.",
    "Usually I review a pipeline change, debug a data quality issue, and talk with an analyst about what a metric should mean. The conversations save us more rework than clever code does.",
    "SQL and clear communication go a long way. A small pipeline project with a couple of dbt tests would give us something concrete to talk about.",
    "Sure, a short README and one example of a test would be great. Send it next week and include the question you'd most like feedback on.",
)


def normalized(text: str) -> str:
    return " ".join(text.casefold().split())


class DemoAI:
    async def start(self, game: GameConfig, context: dict | None = None) -> AIResult[str]:
        return AIResult(game.opening, "demo")

    async def turn(self, game: GameConfig, history: list[Message], context: dict | None = None) -> AIResult[str]:
        count = sum(m.role == "user" for m in history)
        if game.title == "Coffee Chat":
            reply = COFFEE_REPLIES[min(count - 1, len(COFFEE_REPLIES) - 1)]
        elif count == 1:
            reply = "I have about a minute. What specific part of the team's work caught your attention?"
        elif count == 2:
            reply = "A short example would help me understand where you'd fit. What small next step are you hoping for?"
        else:
            reply = "Send a brief note with one relevant example and a specific question. I can take a look when I have a gap next week."
        return AIResult(reply, "demo")

    async def score(self, game: GameConfig, history: list[Message], context: dict | None = None) -> AIResult[ScoreFeedback]:
        lines = [m.content for m in history if m.role == "user"]
        text = " ".join(lines).casefold()
        golden = (
            game.title == "Coffee Chat"
            and tuple(map(normalized, lines)) == tuple(map(normalized, DEMO_COFFEE_LINES))
        )
        if golden:
            scores = dict(zip(game.rubric, [4, 2, 3]))
        else:
            specific = any(word in text for word in ("dbt", "sql", "pipeline", "dashboard", "grant", "test"))
            question = "?" in text
            polite = any(word in text for word in ("thanks", "thank", "could", "would"))
            base = 1 if len(text.split()) < 8 else 2
            signals = [question, specific, polite]
            if game.title == "Elevator Pitch":
                signals = [len(text.split()) >= 15, specific, "engineer" in text]
            elif game.title == "Follow-Up":
                signals = [specific, any(w in text for w in ("share", "project", "test")), polite]
            elif game.title == "Cold Outreach":
                signals = [specific, len(text.split()) <= 80 and polite, question]
            scores = {dimension: min(4, base + int(signals[i]) + int(specific and question))
                      for i, dimension in enumerate(game.rubric)}
        best = max(lines, key=len)[:180]
        if game.title == "Coffee Chat":
            fix = "Ask about one concrete challenge in their dbt migration instead of asking a broad career question."
            rewrite = "As you move to dbt, which data quality check has been hardest to get right?"
        elif game.title == "Elevator Pitch":
            fix = "Connect one project you built to the data engineering role you want."
            rewrite = "I'm Alex, a BYU CS junior. I built a small SQL pipeline with data quality tests, and I'd like to learn about your data engineering internships."
        elif game.title == "Follow-Up":
            fix = "Refer to the dbt conversation and end with one easy question."
            rewrite = "Your dbt migration sounded interesting. I'm planning a small project with dbt tests; is there one kind of test you'd recommend starting with?"
        else:
            fix = "Make your request specific enough to answer in a short reply."
            rewrite = "I'm a BYU CS junior practicing data engineering. Could you suggest one skill your team values most in an intern?"
        contacts = (context or {}).get("contacts") or []
        user = (context or {}).get("user") or {}
        role = (user.get("target_roles") or ["the work you are exploring"])[0]
        if contacts:
            contact = contacts[0]
            note = (contact.get("notes") or ["their work"])[0]
            follow_up = f"Ask {contact.get('name', 'them')} how {note.lower()} connects to the {role} work you are exploring."
        else:
            follow_up = f"Ask one person what part of their day-to-day work connects to the {role} you are exploring."
        return AIResult(ScoreFeedback(
            scores=scores, best_moment=f'You gave the conversation a direction with: "{best}"',
            one_fix=fix, rewrite_example=rewrite, recommended_follow_up=follow_up,
        ), "demo")

    async def reminders(self, context: dict) -> AIResult[ReminderPayload]:
        contacts = {c["id"]: c for c in context["contacts"]}
        completed_ids = [t["contact_id"] for t in reversed(context["completed_tasks"]) if t.get("contact_id")]
        ordered = list(dict.fromkeys(completed_ids + list(contacts)))
        averages = context["score_averages"]
        tip = ""
        if averages.get("specificity", 5) < 3:
            tip = "Your coffee chats score low on specificity. Ask about one concrete detail they mentioned."
        elif averages:
            weak = min(averages, key=averages.get)
            if averages[weak] < 3:
                tip = f"Practice {weak.replace('_', ' ')}: give one concrete example in your next conversation."
        reminders = []
        for identifier in ordered:
            contact = contacts.get(identifier)
            if not contact or not contact["notes"]:
                continue
            notes = " ".join(contact["notes"])
            name = contact["name"]
            short_name = name.split()[0][:40]
            if "dbt" in notes.casefold():
                headline = f"Ask {short_name} about dbt"
                reason = f"{name} mentioned their team is moving to dbt. A small dbt project would give you a specific reason to follow up next week."
                action = "Build a tiny dbt model with one test, then ask next week which migration challenge it resembles."
            elif "grant deadline september 30, 2026" in notes.casefold() and context["today"] > "2026-09-30":
                headline = f"Ask {short_name} about the grant"
                reason = f"{name}'s September 30 grant deadline has passed. Ask how the submission went, and offer to discuss the outdated lab website they mentioned."
                action = "Ask how the grant submission went and whether help with the lab website would be useful."
            else:
                hook = contact["notes"][-1][:320]
                headline = f"Follow up with {short_name}"
                reason = f'You recorded this about {name}: "{hook}". Use that specific detail to open the conversation.'
                action = f'Ask one focused question about "{hook}".'
            reminders.append(Reminder(contact_id=identifier, headline=headline,
                                      reason=reason, suggested_action=action, tip=tip))
            if len(reminders) == 3:
                break
        return AIResult(ReminderPayload(reminders=reminders), "demo")

    async def draft(self, context: dict) -> AIResult[str]:
        contact = context["contact"]
        name = contact["name"].split()[0]
        student = context["user"]["name"].split()[0]
        notes = " ".join(contact["notes"]).casefold()
        if "dbt" in notes:
            body = "I enjoyed hearing about your team's move to dbt. I'm planning a small project with a model and a data quality test to put your advice into practice. Which kind of test would you recommend starting with?"
        elif "grant deadline september 30, 2026" in notes and context["today"] > "2026-09-30":
            body = "I remembered your grant deadline was September 30 and hope the submission went smoothly. You also mentioned the lab website could use an update; I'd be happy to explore helping. How did the submission go?"
        else:
            # Preserve a bounded, literal hook without claiming it is completed work.
            hook = (contact["notes"][-1] if contact["notes"] else context["reason"])
            hook = re.sub(r"\s+", " ", hook)
            hook = " ".join(hook.split()[:25])
            projects = context["user"].get("personal_projects") or []
            project = re.sub(r"\s+", " ", projects[0]).split(".")[0][:120] if projects else ""
            if project:
                body = f'I made a note from our conversation: "{hook}". I am exploring this through a project on {project}. What would be a useful small next step to learn more about that?'
            else:
                body = f'I made a note from our conversation: "{hook}". What would be a useful small next step to learn more about that?'
        return AIResult(f"Hi {name}, {body} — {student}", "demo")

    async def suggest(self, context: dict) -> AIResult[list[str]]:
        contact = context["contact"]
        name = contact["name"].split()[0]
        notes = " ".join(contact["notes"]).casefold()
        if "dbt" in notes:
            suggestions = [f"Ask {name} what the biggest challenge in their dbt migration has been", "Ask what kind of dbt tests they've found most valuable"]
        elif "grant" in notes:
            suggestions = [f"Ask {name} how the grant submission went", "Ask if there's a way you could help with the lab website"]
        else:
            hook = (contact["notes"][-1] if contact["notes"] else "their work")[:100]
            suggestions = [f"Ask {name} more about {hook.lower()}", f"Ask what {name} is working on this week"]
        role = (context["user"].get("target_roles") or ["your field"])[0]
        suggestions.append(f"Ask how their experience connects to {role}")
        return AIResult(suggestions[:3], "demo")

    async def propose_tasks(self, context: dict) -> AIResult[list[dict]]:
        user = context["user"]
        contacts = context.get("contacts", [])
        roles = user.get("target_roles", ["your target role"])
        role = roles[0] if roles else "your target role"
        tasks = [{
            "title": "Reach out to one new person this week",
            "description": f"Find someone working in {role} and send a specific, low-pressure question.",
            "type": "online_outreach", "difficulty": "easy", "xp": 35,
            "frequency": "weekly", "skill": "outreach",
        }]
        for contact in contacts[:2]:
            if contact.get("notes"):
                tasks.append({
                    "title": f"Follow up with {contact['name']}",
                    "description": f"Reconnect about: {contact['notes'][-1][:120]}",
                    "type": "follow_up", "difficulty": "easy", "xp": 40,
                    "frequency": "once", "skill": "follow up", "contact_id": contact["id"],
                })
        averages = context.get("score_averages", {})
        if averages:
            weak = min(averages, key=averages.get)
            if averages[weak] < 3:
                tasks.append({
                    "title": f"Practice {weak.replace('_', ' ')} in a conversation",
                    "description": f"Your {weak.replace('_', ' ')} scores are low. Focus on this in your next interaction.",
                    "type": "personal_chat", "difficulty": "medium", "xp": 45,
                    "frequency": "weekly", "skill": weak.replace("_", " "),
                })
        tasks.extend([
            {"title": "Attend a networking event or meetup", "description": f"Find a {role}-related event and talk to at least one person there.", "type": "event", "difficulty": "hard", "xp": 80, "frequency": "once", "skill": "events"},
            {"title": "Schedule an informational interview", "description": "Invite someone in your target field to a 15-minute conversation about their work.", "type": "personal_chat", "difficulty": "medium", "xp": 60, "frequency": "once", "skill": "informational interview"},
        ])
        return AIResult(tasks[:5], "demo")

    async def research(self, context: dict) -> AIResult[ResearchPayload]:
        student = context.get("student", {})
        roles = ", ".join(student.get("target_roles") or ["the role you want"])
        location = student.get("location") or "your area"
        return AIResult(ResearchPayload(
            profile_summary=(
                f"Live research will look for public {roles} connection paths and "
                f"upcoming events near {location}. Enable live mode to search current sources."
            ),
            candidates=[],
        ), "demo")
