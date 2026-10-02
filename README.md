# Networking Buddy

Networking Buddy helps students build a daily habit of real professional connections. The home experience prioritizes in-person events, personal chats, calls, online outreach, and thoughtful follow-up. Practice games are optional side quests.

## Run the backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
python main.py
```

Open <http://127.0.0.1:8000/>. The default is deterministic demo mode, so it does not spend Claude credits.

## Enable Claude sparingly

Copy `.env.example` to `.env`, add the API key, and explicitly enable live calls:

```bash
cp .env.example .env
# edit .env: add ANTHROPIC_API_KEY, set DEMO_MODE=0 and USE_LLM=1
python main.py
```

Live calls are limited to game turns and scoring. Game starts use seeded opening lines, and one failed or malformed response falls back locally without retrying, keeping usage predictable.

For frontend-only development, use the independent harness described in [frontend/README_C.md](frontend/README_C.md).
