import json
import os
from copy import deepcopy
from pathlib import Path
from threading import RLock
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
SEED_PATH = BASE_DIR / "seed.json"
DB_PATH = Path(os.getenv("NETWORKING_BUDDY_DB", str(BASE_DIR / "db.json")))
_LOCK = RLock()


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def reset_db() -> dict[str, Any]:
    state = _read_json(SEED_PATH)
    with _LOCK:
        DB_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return deepcopy(state)


def load_db() -> dict[str, Any]:
    with _LOCK:
        if not DB_PATH.exists():
            return reset_db()
        return _read_json(DB_PATH)


def save_db(state: dict[str, Any]) -> None:
    temporary_path = DB_PATH.with_suffix(".tmp")
    with _LOCK:
        temporary_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
        temporary_path.replace(DB_PATH)
