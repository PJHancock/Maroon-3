import os
from pathlib import Path


def load_local_environment() -> None:
    """Load .env before the launcher reads HOST and PORT."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(Path(__file__).resolve().with_name(".env"), override=False)


def main() -> None:
    load_local_environment()
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "0") == "1",
    )


if __name__ == "__main__":
    main()
