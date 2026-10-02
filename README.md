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

Live calls are limited to game turns, scoring, and coach message drafts. Game starts use seeded opening lines, and one failed or malformed response falls back locally without retrying, keeping usage predictable.

## Frontend

Plain HTML, CSS, and ES modules in `frontend/`, served by the backend at `/`. No build step.

```
frontend/
  index.html     one <section> per screen
  app.js         shared core: hash router, api(), state cache, celebrate(), sheet/toast/esc
  mock.js        in-browser fake backend for ?mock=1 (mirrors backend/main.py and seed.json)
  home.js        streak, XP, coach cards + drafts, task cards, game picker   (#/home)
  contacts.js    contact log, search, add-contact form                       (#/contacts)
  game.js        practice game chat, then the score                          (#/game/{id})
  tasks.js       task types, reflection form, then success                   (#/task/{id})
  styles.css     the whole app's styles
```

Each screen module imports from `app.js`, calls `registerScreen(name, { show })`, and exports pure render functions (data in, HTML out) that the tests check.

Before a game starts, `game.js` builds a privacy-scoped context from `/api/state` (profile, up to 8 contacts with notes, open tasks, recent scores) and sends it with `/start`, `/turn`, and `/score`, so the persona and scorer can reference the student's goals and contacts.

URL flags:

- `?mock=1` runs every screen against `mock.js`, with no backend needed (`python -m http.server` from `frontend/` works).
- `?debug=1` shows buttons on home to add XP locally and test the celebration.

## Tests

```bash
npm test                                                  # all frontend tests, against the mock
API_BASE=http://127.0.0.1:8000 npm test                   # contract tests against a running backend (read-only)
API_BASE=http://127.0.0.1:8000 API_MUTATE=1 npm test      # also tests that change data; point NETWORKING_BUDDY_DB at a scratch file first
```
