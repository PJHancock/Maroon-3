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

Live calls are limited to game roleplay, scoring, coach reminders, and message drafts. Demo mode is fully local; live failures fall back to deterministic responses, and the server never exposes the API key to the browser.

## Integrated frontend

The root app now uses one module graph:

```text
frontend/index.html
  ├─ app_b.js       shared router, API adapter, state cache, celebrations
  ├─ home_b.js      streak, coach cards, connection-priority tasks, practice picker
  ├─ contacts_b.js  contact search and manual contact capture
  ├─ game_C.js      context-aware practice games and feedback screen
  └─ tasks_C.js     connection reflection, contact memory, XP/streak success screen
```

The backend is served from the root `backend/` package. It owns the typed API
contracts, atomic JSON repository, XP/streak rules, contact/task matching, and
the demo/Claude AI boundary. Teammate C's standalone harness remains available
at [frontend/README_C.md](frontend/README_C.md).

## Tests

```bash
npm test
python -m py_compile backend/*.py main.py
python -m unittest discover -s tests/backend -v
```

Run the app with `python main.py`, then open <http://127.0.0.1:8000/>. Use
`POST /api/reset` or the API docs at `/docs` to reset the demo state.
