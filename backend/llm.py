import json
import os
from datetime import date
from typing import Any

from .games import GAME_CONFIGS


def llm_enabled() -> bool:
    return os.getenv("USE_LLM", "0") == "1" and os.getenv("DEMO_MODE", "1") != "1" and bool(os.getenv("ANTHROPIC_API_KEY"))


def model_name() -> str:
    return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")


def _history_for_claude(history: list[dict[str, Any]]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "user", "content": "[The student begins the conversation.]"}]
    for message in history[-12:]:
        role = "assistant" if message.get("role") == "assistant" else "user"
        content = str(message.get("content", "")).strip()
        if not content:
            continue
        if messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + content
        else:
            messages.append({"role": role, "content": content})
    return messages


def _context_text(context: dict[str, Any]) -> str:
    safe_context = {
        "user": context.get("user", {}),
        "contacts": context.get("contacts", [])[:8],
        "open_tasks": context.get("open_tasks", [])[:8],
        "recent_game_sessions": context.get("recent_game_sessions", [])[:5],
        "today": date.today().isoformat(),
    }
    return json.dumps(safe_context, ensure_ascii=False)[:7000]


def _text_response(response: Any) -> str:
    blocks = getattr(response, "content", []) or []
    return "\n".join(getattr(block, "text", "") for block in blocks if getattr(block, "type", "text") == "text").strip()


def ask_claude(system: str, messages: list[dict[str, str]], max_tokens: int) -> str:
    if not llm_enabled():
        raise RuntimeError("Live Claude calls are disabled. Set USE_LLM=1 and DEMO_MODE=0 to enable them.")
    from anthropic import Anthropic

    client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    response = client.messages.create(model=model_name(), max_tokens=max_tokens, system=system, messages=messages)
    return _text_response(response)


def ask_json(system: str, messages: list[dict[str, str]], fallback: dict[str, Any], max_tokens: int) -> dict[str, Any]:
    try:
        text = ask_claude(system, messages, max_tokens=max_tokens)
        cleaned = text.replace("```json", "").replace("```", "").strip()
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else fallback
    except Exception:
        return fallback


def fallback_turn(game: str, context: dict[str, Any]) -> str:
    user = context.get("user", {})
    role = (user.get("target_roles") or ["the kind of work you want next"])[0]
    contacts = context.get("contacts") or []
    if game == "coffee_chat" and contacts:
        contact = contacts[0]
        note = (contact.get("notes") or ["their current work"])[0]
        return f"You are exploring {role}. What question could connect what {contact.get('name', 'someone you know')} mentioned about {note} to the work you want to understand?"
    if game == "coffee_chat":
        return f"Since you are exploring {role}, what part of the day-to-day work would you most like to understand?"
    if game == "cold_call":
        return "That is a thoughtful start. What is the smallest, clearest next step you would like to ask for?"
    return "That gives me a useful starting point. What specific detail could make the conversation more personal?"


def persona_turn(game: str, history: list[dict[str, Any]], context: dict[str, Any]) -> str:
    config = GAME_CONFIGS[game]
    fallback = fallback_turn(game, context)
    system = f"""You are roleplaying {config['persona']} in a networking practice game for a university student.
Stay in character. Be friendly but realistic and respond to what the student actually said.
Use the student context only when it creates a natural, meaningful connection. You may ask one
specific follow-up question when appropriate. Do not invent experience, relationships, or facts.
Never coach the student or break character. Keep the reply to 2-3 sentences.

Student context:
{_context_text(context)}"""
    if not llm_enabled():
        return fallback
    return ask_claude(system, _history_for_claude(history), max_tokens=180) or fallback


def fallback_score(game: str, context: dict[str, Any]) -> dict[str, Any]:
    rubric = GAME_CONFIGS[game]["rubric"]
    scores = {dimension: 3 for dimension in rubric}
    contacts = context.get("contacts") or []
    if contacts:
        follow_up = f"Ask {contacts[0].get('name', 'this person')} how their experience with {(contacts[0].get('notes') or ['their work'])[0]} connects to the {((context.get('user') or {}).get('target_roles') or ['role'])[0]} you are exploring."
    else:
        follow_up = f"Ask one person how their day-to-day work connects to the {((context.get('user') or {}).get('target_roles') or ['role'])[0]} you are exploring."
    return {
        "scores": scores,
        "best_moment": "You completed the practice and created a chance to improve.",
        "one_fix": "Make your next question more specific to the person you are speaking with.",
        "rewrite_example": "Connect your question to something the other person actually mentioned.",
        "recommended_follow_up": follow_up,
    }


def score_game(game: str, history: list[dict[str, Any]], context: dict[str, Any]) -> dict[str, Any]:
    fallback = fallback_score(game, context)
    config = GAME_CONFIGS[game]
    system = f"""You are a practical networking coach scoring a university student's practice.
Game: {config['title']}. Goal: {config['goal']}.
Score each dimension from 1 to 5: {', '.join(config['rubric'])}.
A 5 is rare. Be honest and specific. Use the student context to recommend one thoughtful follow-up
question only when it is genuinely relevant. Never invent a contact detail.
Return ONLY JSON with this exact shape:
{{"scores": {{"dimension": 1}}, "best_moment": "one sentence", "one_fix": "one sentence", "rewrite_example": "one example", "recommended_follow_up": "one question"}}

Student context:
{_context_text(context)}"""
    if not llm_enabled():
        return fallback
    result = ask_json(system, _history_for_claude(history), fallback, max_tokens=320)
    result.setdefault("recommended_follow_up", fallback["recommended_follow_up"])
    return result
