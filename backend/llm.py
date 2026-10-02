"""Replaceable AI boundary. Claude is async; offline behavior has the same port."""

import asyncio
import json
import logging
from collections.abc import Callable
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from . import prompts
from .demo import AIResult, DemoAI
from .games import GameConfig
from .models import Message, ReminderPayload, ResearchPayload, ScoreFeedback

logger = logging.getLogger(__name__)
Payload = TypeVar("Payload", bound=BaseModel)


class NetworkingAI(Protocol):
    async def start(self, game: GameConfig, context: dict | None = None) -> AIResult[str]: ...
    async def turn(self, game: GameConfig, history: list[Message], context: dict | None = None) -> AIResult[str]: ...
    async def score(self, game: GameConfig, history: list[Message], context: dict | None = None) -> AIResult[ScoreFeedback]: ...
    async def reminders(self, context: dict) -> AIResult[ReminderPayload]: ...
    async def draft(self, context: dict) -> AIResult[str]: ...
    async def research(self, context: dict) -> AIResult[ResearchPayload]: ...


class ProviderFailure(Exception):
    pass


class TextTransport(Protocol):
    async def complete(self, system: str, messages: list[dict], max_tokens: int) -> str: ...
    async def close(self) -> None: ...


class ClaudeTransport:
    def __init__(self, api_key: str, model: str, timeout: float):
        # The SDK is never imported or constructed in offline mode.
        from anthropic import APIError, AsyncAnthropic

        self.api_error = APIError
        self.client = AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=0)
        self.model = model

    async def complete(self, system: str, messages: list[dict], max_tokens: int) -> str:
        try:
            response = await self.client.messages.create(
                model=self.model, max_tokens=max_tokens, system=system, messages=messages,
            )
        except self.api_error as exc:
            raise ProviderFailure(type(exc).__name__) from exc
        text = "\n".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            raise ProviderFailure("Empty text response")
        return text

    async def complete_with_web_search(self, system: str, messages: list[dict],
                                       max_tokens: int, *, location: str = "") -> str:
        """Use Anthropic's hosted web-search tool; no second search API key is needed."""
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                tools=[{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": 3,
                    "user_location": {
                        "type": "approximate",
                        "city": location.split(",", 1)[0].strip() if location else None,
                        "region": location.split(",", 1)[1].strip() if "," in location else None,
                        "country": "US",
                        "timezone": "America/Denver",
                    },
                }],
            )
        except self.api_error as exc:
            raise ProviderFailure(type(exc).__name__) from exc
        text = "\n".join(block.text for block in response.content if block.type == "text").strip()
        if not text:
            raise ProviderFailure("Empty web research response")
        return text

    async def close(self) -> None:
        await self.client.close()


def parse_json(text: str):
    import re

    text = text.strip()
    # First try: extract the content of a fenced code block anywhere in the text.
    # This handles preamble like "Here is your score:\n```json\n{...}\n```".
    match = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()
    else:
        # Fallback: strip stray fence markers (the build plan's approach).
        text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Web-search-enabled responses sometimes add a short citation note
        # after an otherwise valid JSON object.
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise
        return json.loads(text[start:end + 1])


def validate_rubric(feedback: ScoreFeedback, game: GameConfig) -> None:
    if set(feedback.scores) != set(game.rubric):
        raise ValueError("Scores must exactly match the game's rubric")


def validate_reminders(payload: ReminderPayload, context: dict) -> None:
    valid = {c["id"] for c in context["contacts"]}
    ids = [r.contact_id for r in payload.reminders]
    if any(identifier not in valid for identifier in ids) or len(ids) != len(set(ids)):
        raise ValueError("Reminders must reference distinct, existing contacts")
    if valid and not payload.reminders and any(c["notes"] for c in context["contacts"]):
        raise ValueError("Return at least one reminder when grounded contact notes exist")


class ClaudeAI:
    def __init__(self, transport: TextTransport, timeout: float = 20):
        self.transport = transport
        self.timeout = timeout
        self.fallback = DemoAI()

    async def _text(self, system: str, messages: list[dict], fallback: str,
                    validate: Callable[[str], None] | None = None) -> AIResult[str]:
        try:
            async with asyncio.timeout(self.timeout):
                text = await self.transport.complete(system, messages, 600)
                if not text.strip():
                    raise ValueError("Empty response")
                if validate:
                    validate(text)
                return AIResult(text, "live")
        except (ProviderFailure, TimeoutError, ValueError) as exc:
            logger.warning("Using offline text fallback (%s)", type(exc).__name__)
            return AIResult(fallback, "fallback")

    async def _json(self, system: str, messages: list[dict], schema: type[Payload],
                    fallback: Payload, validate: Callable[[Payload], None]) -> AIResult[Payload]:
        try:
            # A single total time budget covers both attempts.
            async with asyncio.timeout(self.timeout):
                for attempt in range(2):
                    text = await self.transport.complete(system, messages, 1400)
                    try:
                        payload = schema.model_validate(parse_json(text))
                        validate(payload)
                        return AIResult(payload, "live")
                    except (ValueError, ValidationError):
                        if attempt:
                            raise
                        # Retry with instructions, without echoing potentially unsafe output.
                        system += "\nYour last output was invalid. Return ONLY JSON matching the exact schema."
        except (ProviderFailure, TimeoutError, ValueError, ValidationError) as exc:
            logger.warning("Using offline JSON fallback (%s)", type(exc).__name__)
        return AIResult(fallback, "fallback")

    async def start(self, game: GameConfig, context: dict | None = None) -> AIResult[str]:
        return await self._text(prompts.persona_prompt(game, context or {}),
                                [{"role": "user", "content": "[The student walks up to you.]"}],
                                (await self.fallback.start(game)).value)

    async def turn(self, game: GameConfig, history: list[Message], context: dict | None = None) -> AIResult[str]:
        messages = [m.model_dump() for m in history]
        if messages[0]["role"] == "assistant":
            messages.insert(0, {"role": "user", "content": "[The student walks up to you.]"})
        return await self._text(prompts.persona_prompt(game, context or {}), messages,
                                (await self.fallback.turn(game, history)).value)

    async def score(self, game: GameConfig, history: list[Message], context: dict | None = None) -> AIResult[ScoreFeedback]:
        return await self._json(
            prompts.score_prompt(game, context or {}),
            [{"role": "user", "content": json.dumps([m.model_dump() for m in history])}],
            ScoreFeedback, (await self.fallback.score(game, history)).value,
            lambda feedback: validate_rubric(feedback, game),
        )

    async def reminders(self, context: dict) -> AIResult[ReminderPayload]:
        return await self._json(
            prompts.REMINDERS_PROMPT, [{"role": "user", "content": json.dumps(context)}],
            ReminderPayload, (await self.fallback.reminders(context)).value,
            lambda payload: validate_reminders(payload, context),
        )

    async def draft(self, context: dict) -> AIResult[str]:
        def validate(text: str):
            if len(text.split()) >= 80 or "just checking in" in text.casefold() or "?" not in text:
                raise ValueError("Draft must be under 80 words, specific, and contain a question")

        return await self._text(
            prompts.DRAFT_PROMPT, [{"role": "user", "content": json.dumps(context)}],
            (await self.fallback.draft(context)).value, validate,
        )

    async def research(self, context: dict) -> AIResult[ResearchPayload]:
        fallback = (await self.fallback.research(context)).value
        complete = getattr(self.transport, "complete_with_web_search", None)
        if complete is None:
            return AIResult(fallback, "fallback")
        try:
            async with asyncio.timeout(self.timeout):
                text = await complete(
                    prompts.research_prompt(context),
                    [{"role": "user", "content": "Search now and return the requested JSON."}],
                    1800,
                    location=(context.get("student") or {}).get("location", ""),
                )
                payload = ResearchPayload.model_validate(parse_json(text))
                return AIResult(payload, "live")
        except (ProviderFailure, TimeoutError, ValueError, ValidationError) as exc:
            logger.warning("Using offline research fallback (%s)", type(exc).__name__)
            return AIResult(fallback, "fallback")
