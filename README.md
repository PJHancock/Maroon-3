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

## Test on a phone

For a phone on the same Wi-Fi as the laptop, run this from the repository root:

```bash
python scripts/phone_demo.py
```

Open the printed `Phone URL` on the phone and keep the terminal running. This
launch mode binds to the local network while preserving the app's same-origin
API calls, so the phone does not need a separate backend URL. If macOS asks
whether Python may accept incoming connections, allow it on the current
network. Both devices must be on the same Wi-Fi.

For live personalized recommendations, set `DEMO_MODE=0` and
`ANTHROPIC_API_KEY` in `.env` before starting the phone launcher. Demo mode is
safe for UI testing and does not spend Claude credits.

The app includes a service worker and can be installed as a PWA when opened
over HTTPS. A plain `http://192.168.x.x` LAN address is sufficient for testing
the website, but browser PWA installation rules usually require HTTPS. For a
temporary HTTPS URL, install either `cloudflared` or `ngrok`, keep the phone
launcher running, and run one of:

```bash
cloudflared tunnel --url http://127.0.0.1:8000
ngrok http 8000
```

Then open the generated HTTPS URL and use the phone's “Add to Home Screen” or
“Install app” action.

## Enable Claude sparingly

Copy `.env.example` to `.env`, add the API key, and explicitly enable live calls:

```bash
cp .env.example .env
# edit .env: add ANTHROPIC_API_KEY and set DEMO_MODE=0
python main.py
```

Live calls are limited to game roleplay, scoring, coach reminders, message drafts, and explicit opportunity refreshes. In live mode, opportunity research uses Claude's hosted web-search tool with the user's profile and a 90-day window; results are validated and cached in memory to avoid repeated spend. Demo mode is fully local; live failures fall back safely, and the server never exposes the API key to the browser.

## Integrated frontend

The root app now uses one module graph:

```text
frontend/index.html
  ├─ app_b.js       shared router, API adapter, state cache, celebrations
  ├─ home_b.js      streak, coach cards, connection-priority tasks, live research, practice picker
  ├─ contacts_b.js  contact search, add/edit/delete, and manual contact capture
  ├─ game_C.js      context-aware practice games and feedback screen
  └─ tasks_C.js     preparation playbooks, event/person actions, contact calls, reflection, XP/streak success screen
```

The backend is served from the root `backend/` package. It owns the typed API
contracts, atomic JSON repository, XP/streak rules, contact/task matching, and
the demo/Claude AI boundary. Teammate C's standalone harness remains available
at [frontend/README_C.md](frontend/README_C.md).

Contacts can be updated with `PUT/PATCH /api/contacts/{id}` or removed with
`DELETE /api/contacts/{id}`. Interaction reports send `contact_id` when an
existing person is selected, so their note and `last_contact` update in one
transaction. `GET /api/opportunities` performs profile-scoped live research;
`POST/DELETE /api/opportunities/{id}/radar` persists the user's radar choices.
Opening a connection task now goes through `GET /api/tasks/{id}/prep` first.
The preparation screen provides a task-specific checklist, questions, scripts,
phone/email actions, LinkedIn search, and lazy-loaded research. Selected public
opportunities persist through `POST/DELETE /api/tasks/{id}/context` and remain
visible when the user submits the interaction report.

## Tests

```bash
npm test
python -m py_compile backend/*.py main.py
python -m unittest discover -s tests/backend -v
```

Run the app with `python main.py`, then open <http://127.0.0.1:8000/>. Use
`POST /api/reset` or the API docs at `/docs` to reset the demo state.
