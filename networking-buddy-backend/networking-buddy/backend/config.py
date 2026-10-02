"""Environment configuration, loaded at the composition root only."""

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

BACKEND_DIR = Path(__file__).resolve().parent


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    if value.lower().strip() not in {"1", "0", "true", "false", "yes", "no"}:
        raise ValueError(f"{name} must be 1/0, true/false, or yes/no")
    return value.lower().strip() in {"1", "true", "yes"}


@dataclass(frozen=True)
class Settings:
    db_path: Path = BACKEND_DIR / "db.json"
    seed_path: Path = BACKEND_DIR / "seed.json"
    frontend_dir: Path = BACKEND_DIR.parent / "frontend"
    demo_mode: bool = True
    demo_date: date | None = date(2026, 10, 2)
    api_key: str = ""
    model: str = "claude-sonnet-5-5"
    llm_timeout: float = 20.0
    timezone: str = "America/Denver"
    allow_reset: bool = True
    cors_origins: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        ZoneInfo(self.timezone)  # Fail at startup, not during an XP action.
        if self.llm_timeout <= 0:
            raise ValueError("LLM_TIMEOUT_SECONDS must be positive")
        if not self.demo_mode and not self.api_key:
            raise ValueError("Set ANTHROPIC_API_KEY or enable DEMO_MODE=1")
        if self.db_path.resolve() == self.seed_path.resolve():
            raise ValueError("DB_PATH must not point to seed.json")


def get_settings() -> Settings:
    from dotenv import load_dotenv

    load_dotenv(BACKEND_DIR / ".env", override=False)
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    demo = env_bool("DEMO_MODE", not bool(api_key))
    raw_date = os.getenv("DEMO_DATE", "2026-10-02").strip()
    return Settings(
        db_path=Path(os.getenv("DB_PATH", str(BACKEND_DIR / "db.json"))).resolve(),
        frontend_dir=Path(os.getenv("FRONTEND_DIR", str(BACKEND_DIR.parent / "frontend"))).resolve(),
        demo_mode=demo,
        demo_date=date.fromisoformat(raw_date) if demo and raw_date else None,
        api_key=api_key,
        model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        llm_timeout=float(os.getenv("LLM_TIMEOUT_SECONDS", "20")),
        timezone=os.getenv("APP_TIMEZONE", "America/Denver"),
        allow_reset=env_bool("ALLOW_RESET", True),
        cors_origins=tuple(x.strip() for x in os.getenv("CORS_ORIGINS", "").split(",") if x.strip()),
    )
