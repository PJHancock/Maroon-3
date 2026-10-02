import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .db import load_db, reset_db, save_db
from .games import GAME_CONFIGS
from .llm import draft_message, persona_turn, score_game


load_dotenv()
app = FastAPI(title="Networking Buddy API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class GameRequest(BaseModel):
    history: list[dict[str, Any]] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)


class TaskCompletion(BaseModel):
    met_name: str = Field(min_length=1, max_length=120)
    role: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=160)
    hook: str = Field(min_length=1, max_length=1000)


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    how_met: str = Field(default="", max_length=160)
    company: str = Field(default="", max_length=160)
    role: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=200)
    last_contact: date | None = None
    notes: list[str] = Field(default_factory=list)


class DraftRequest(BaseModel):
    contact_id: str
    reason: str = Field(default="", max_length=1000)


def public_state() -> dict[str, Any]:
    state = load_db()
    state["open_tasks"] = [task for task in state.get("tasks", []) if task.get("status") == "open"]
    return state


def today() -> str:
    return date.today().isoformat()


def award_connection_xp(state: dict[str, Any], amount: int) -> None:
    user = state.setdefault("user", {})
    current_day = today()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    user["xp"] = int(user.get("xp", 0)) + int(amount)
    if user.get("last_active") == current_day:
        user["today_connection_done"] = True
        return
    user["streak"] = int(user.get("streak", 0)) + 1 if user.get("last_active") == yesterday else 1
    user["last_active"] = current_day
    user["today_connection_done"] = True


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    return public_state()


@app.post("/api/games/{game}/start")
def start_game(game: str, payload: GameRequest) -> dict[str, Any]:
    config = GAME_CONFIGS.get(game)
    if not config:
        raise HTTPException(status_code=404, detail="Unknown game")
    return {"title": config["title"], "goal": config["goal"], "opening_line": config["opening_line"], "max_turns": config["max_turns"]}


@app.post("/api/games/{game}/turn")
def game_turn(game: str, payload: GameRequest) -> dict[str, str]:
    if game not in GAME_CONFIGS:
        raise HTTPException(status_code=404, detail="Unknown game")
    return {"reply": persona_turn(game, payload.history, payload.context)}


@app.post("/api/games/{game}/score")
def score(game: str, payload: GameRequest) -> dict[str, Any]:
    config = GAME_CONFIGS.get(game)
    if not config:
        raise HTTPException(status_code=404, detail="Unknown game")
    result = score_game(game, payload.history, payload.context)
    result["xp"] = config["xp"]
    state = load_db()
    state.setdefault("game_sessions", []).insert(0, {"id": f"g{len(state.get('game_sessions', [])) + 1}", "game": game, "date": today(), "scores": result.get("scores", {}), "xp": config["xp"]})
    state.setdefault("user", {})["xp"] = int(state.get("user", {}).get("xp", 0)) + config["xp"]
    save_db(state)
    return result


@app.post("/api/tasks/{task_id}/complete")
def complete_task(task_id: str, payload: TaskCompletion) -> dict[str, Any]:
    state = load_db()
    task = next((item for item in state.get("tasks", []) if item.get("id") == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.get("status") == "complete":
        raise HTTPException(status_code=409, detail="Task already completed")
    contact = {"id": f"c{len(state.get('contacts', [])) + 1}", "name": payload.met_name, "how_met": task.get("title", ""), "company": payload.company, "role": payload.role, "notes": [payload.hook], "last_contact": today()}
    state.setdefault("contacts", []).insert(0, contact)
    task["status"] = "complete"
    award_connection_xp(state, int(task.get("xp", 0)))
    save_db(state)
    return {"contact": contact, "xp_earned": int(task.get("xp", 0)), "streak": state["user"]["streak"]}


@app.post("/api/contacts")
def create_contact(payload: ContactCreate) -> dict[str, Any]:
    state = load_db()
    if payload.last_contact and payload.last_contact > date.today():
        raise HTTPException(status_code=422, detail="last_contact can't be in the future")
    fields = payload.model_dump(exclude={"last_contact"})
    met_on = payload.last_contact.isoformat() if payload.last_contact else today()
    contact = {"id": f"c{len(state.get('contacts', [])) + 1}", **fields, "last_contact": met_on}
    state.setdefault("contacts", []).insert(0, contact)
    save_db(state)
    return contact


@app.post("/api/reset")
def reset() -> dict[str, Any]:
    return reset_db()


@app.post("/api/coach/reminders")
def reminders() -> dict[str, list[dict[str, Any]]]:
    state = load_db()
    result = []
    for contact in state.get("contacts", [])[:3]:
        name = contact["name"]
        note = ((contact.get("notes") or [""])[0] or "").strip().rstrip(".!")
        try:
            days = (date.today() - date.fromisoformat(contact.get("last_contact", ""))).days
        except ValueError:
            days = None
        if days is None:
            since = "It's a good time to reach out"
        elif days <= 0:
            since = "You just met"
        elif days == 1:
            since = "You talked yesterday"
        else:
            since = f"It's been {days} days since you talked"
        reason = f'{since}. {name} mentioned "{note}", which gives you a genuine reason to reach out.' if note else f"{since}, so it's a good moment to reconnect."
        action = f"Ask {name} one specific question about that." if note else f"Ask {name} what they're working on right now."
        result.append({"contact_id": contact["id"], "headline": f"Follow up with {name}", "reason": reason, "suggested_action": action, "tip": "Mention the detail they shared so it doesn't read like a generic check-in."})
    return {"reminders": result}


@app.post("/api/coach/draft")
def draft(payload: DraftRequest) -> dict[str, str]:
    state = load_db()
    contact = next((item for item in state.get("contacts", []) if item.get("id") == payload.contact_id), None)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": draft_message(contact, payload.reason, state.get("user", {}))}


@app.get("/health")
def health() -> dict[str, Any]:
    demo_mode = os.getenv("DEMO_MODE", "1") == "1"
    return {"ok": True, "demo_mode": demo_mode, "llm_enabled": not demo_mode and os.getenv("USE_LLM", "0") == "1" and bool(os.getenv("ANTHROPIC_API_KEY"))}


FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(FRONTEND_DIR / "index.html")

    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
