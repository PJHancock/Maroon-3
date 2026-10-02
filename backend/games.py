"""Add a game by adding a config; routes and scoring stay shared."""

from dataclasses import dataclass

from .errors import DomainError
from .models import GameInfo


@dataclass(frozen=True)
class GameConfig:
    title: str
    max_turns: int
    xp: int
    persona: str
    goal: str
    rubric: tuple[str, ...]
    opening: str

    def public(self, name: str) -> GameInfo:
        return GameInfo(game=name, title=self.title, max_turns=self.max_turns,
                        xp=self.xp, goal=self.goal, rubric=list(self.rubric))


GAME_CONFIGS = {
    "elevator_pitch": GameConfig(
        title="Elevator Pitch", max_turns=1, xp=10,
        persona="a recruiter at a busy career fair booth with 30 seconds to spare",
        goal="Introduce yourself: who you are, something you've built, what you're looking for.",
        rubric=("clarity", "memorability", "relevance"),
        opening="Hi! I've got about thirty seconds before my next meeting. Tell me about yourself and what you're looking for.",
    ),
    "coffee_chat": GameConfig(
        title="Coffee Chat", max_turns=4, xp=15,
        persona="a software engineer at a Utah tech company who agreed to a 15-minute coffee chat",
        goal="Learn about their work and leave with a natural reason to follow up.",
        rubric=("curiosity", "specificity", "rapport"),
        opening="Hey Alex, glad we could grab coffee! I work on data pipelines at a Utah tech company. What got you interested in data engineering?",
    ),
    "follow_up": GameConfig(
        title="Follow-Up", max_turns=1, xp=10,
        persona="a data engineer the student met at an info session 10 days ago, who mentioned their team is moving to dbt",
        goal="Write a follow-up message that gives them a genuine reason to reply.",
        rubric=("specificity", "value_to_them", "low_pressure"),
        opening="You met me at an info session ten days ago, where I mentioned our move to dbt. Write the follow-up message you would send me.",
    ),
    "cold_call": GameConfig(
        title="Cold Outreach", max_turns=3, xp=20,
        persona="a busy hiring manager who has never met the student",
        goal="Earn a reply and a small, specific next step without wasting their time.",
        rubric=("hook", "respect_for_time", "clear_ask"),
        opening="Hi, I'm between meetings and don't think we've met. What can I help you with?",
    ),
}


def get_game(name: str) -> GameConfig:
    try:
        return GAME_CONFIGS[name]
    except KeyError:
        raise DomainError("Unknown game", "game_not_found", 404) from None
