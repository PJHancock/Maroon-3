# Networking Buddy backend prototype

FastAPI backend for the attached five-hour hackathon plan. Python 3.11+.
The plan's eight endpoints, four games, XP/streak rules, contact reflections,
coach reminders, and message drafts are implemented. It also includes reset,
health, generated API documentation, and same-origin frontend serving.

The prototype is intentionally single-user. All phones share Alex's data.
Use **one Uvicorn worker** with JSON storage.

## Start in demo mode

From the extracted `networking-buddy/` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open <http://localhost:8000/docs> to try endpoints, or
<http://localhost:8000/api/state> to inspect Alex's data. Until B and C add
their files to `frontend/`, `/` shows a small backend-ready page.

The build plan's launch command also works:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Demo mode is fully local: no Claude key or network is needed after installing
dependencies. It uses saved dialogue for the scripted coffee chat and a fixed
score for that transcript, with simple deterministic examples for other input.
Demo scores are practice placeholders. `source` identifies `demo`, `live`,
or an offline `fallback` so callers can see what produced a response.

`DEMO_DATE=2026-10-02` freezes the app date for repeatable demos. Set it to an
empty value to use the configured timezone's real date. The seed itself stays
dated October 2; if using a later real date, Alex's first action may reset the
streak. The demo seed changes Sarah's grant deadline to September 30, 2026,
resolving the plan's conflict between “deadline just passed” and “mid-October.”

## Connect B and C's frontend

Put their `index.html`, JS, CSS, manifest, and icons in `frontend/`. FastAPI
serves them at `/`, with API calls at `/api/...`. Use a hash router and relative
fetch URLs, and restart if changing `FRONTEND_DIR`. No CORS configuration is
needed when using this server for both the app and API.

Read [docs/frontend-integration.md](docs/frontend-integration.md) for exact
request/response shapes and copyable JavaScript examples. That document assigns
the endpoints to B and C, including history ordering, retry behavior, and when
to refresh home state and coach cards. The backend does not supply or replace
their frontend implementation files.

For a separate frontend dev server, explicitly allow its origin in `.env`:

```dotenv
CORS_ORIGINS=http://localhost:5500
```

Use the backend's full URL in that dev server's fetch helper. Serve the final
phone app through FastAPI so a tunnel exposes everything with one HTTPS URL.

## Switch to Claude

Edit `backend/.env`, then restart the server:

```dotenv
DEMO_MODE=0
ANTHROPIC_API_KEY=your_actual_key
ANTHROPIC_MODEL=claude-sonnet-5-5
LLM_TIMEOUT_SECONDS=20
```

The key stays on the backend. Model and timeout are configurable. Claude uses
the async SDK, with no SDK retries. Invalid JSON or invalid score/reminder
schemas get one retry within a single total timeout budget. API failures,
timeouts, and repeated malformed output return an offline result marked
`source: "fallback"`. The model never controls XP or writes directly to storage.

## Run verification

```bash
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s tests -v
```

The 34 core tests exercise the golden path, all games, weak/strong placeholder
scoring, streak calendar boundaries, matching contacts, retry and concurrent
reward handling, persistence/restarts, atomic-write failure, corrupt databases,
JSON retry/validation, and AI timeouts. Nine additional HTTP tests cover the
actual routes, serialization, frontend serving, OpenAPI, optional CORS, and reset.
The HTTP test module reports a skip if its dependencies aren't installed.

With the server running in another terminal:

```bash
python scripts/golden_path.py --reset
```

This resets Alex, runs the actual HTTP demo, tests repeated scoring and task
completion, and prints a result. In demo mode expect **430 XP, a 5-day streak,
four contacts**, and Marcus's dbt reminder at the top. Run it three times before
presenting. The `--reset` flag makes its destructive seed reset explicit.

For a phone, run an HTTPS tunnel as described in the plan:

```bash
cloudflared tunnel --url http://localhost:8000
```

The PWA manifest, icons, home-screen setup, and visual design remain teammate
C's work. This package supplies the API and static-file host.

## Structure and extension points

| File | Responsibility |
| --- | --- |
| `backend/main.py` | Composition root, startup/shutdown, error translation, static files |
| `backend/routes.py` | Thin HTTP adapters; no reward or prompt logic |
| `backend/models.py` | Typed requests, responses, and persisted data |
| `backend/services.py` | Shared application rules and orchestration |
| `backend/db.py` | JSON repository, serialized transactions, atomic replacement |
| `backend/games.py` | Config-driven game catalog and safe public metadata |
| `backend/llm.py` | AI interface, Claude adapter, output validation, timeouts/fallbacks |
| `backend/prompts.py` | Prompts, separate from transport and routes |
| `backend/demo.py` | Scripted offline responses and placeholders |
| `backend/config.py` | Environment settings and path defaults |
| `backend/seed.json` | Read-only demo baseline; runtime `db.json` is created on startup |
| `tests/` | Business behavior and HTTP integration tests |
| `scripts/golden_path.py` | End-to-end HTTP rehearsal |

This applies separation of concerns, dependency inversion, config-driven
behavior, and contract-first integration without introducing a large framework.
`BuddyService` accepts a repository, an AI implementation, and a date function,
so tests use temporary data and fake AI without patching routes or calling Claude.

- **Add a game:** add a `GameConfig` in `games.py`; all three game routes and
  live prompts work with it. Add its demo behavior if you want a custom offline
  scene. The frontend can populate its picker from `state.games`.
- **Replace Claude:** implement the five `NetworkingAI` methods and select the
  implementation in `main.py`; return validated domain models and `AIResult`.
- **Replace storage:** implement `Repository.load_db`, `update`, and `reset_db`.
  Preserve atomic read-modify-write semantics. SQLite is the next modest step
  when JSON or one-worker operation stops being sufficient.
- **Add users later:** introduce authenticated identity at the route/service
  boundary and scope repository data to it. There is intentionally no login or
  user identifier in this single-user demo contract.

## Operational boundaries

Reward-changing operations commit their contact/session, XP, and streak in one
transaction. An in-process lock prevents lost updates between simultaneous
requests; writing to a temporary file and atomically replacing `db.json`
prevents partial JSON. Never run multiple workers or server processes against
the same file: this repository is not a cross-process database.

Task IDs are naturally idempotent. Game `session_id` makes scoring idempotent
across retries and restarts. Old history-only clients deduplicate by game,
transcript, and app date. Use a fresh session ID to intentionally play the same
transcript again. Contact creation itself is not idempotent; disable repeated
submission in B's form.

`POST /api/reset` restores the seed and invalidates active sessions.
`ALLOW_RESET=0` disables it. The app's shared persona and reset endpoint match
the hackathon scope; an external service with independent users needs the
identity and access rules mentioned above.

## Validation in this build environment

34 core tests passed, including the golden path and concurrent reward checks.
All Python source files passed compilation. The nine HTTP tests and real
Uvicorn/Claude calls could not be run here: FastAPI, HTTPX, Uvicorn, and the
Anthropic SDK were absent, and package installation was unavailable. Run the
commands above locally to verify those integration boundaries before the demo.

Implementation references: [FastAPI application structure](https://fastapi.tiangolo.com/tutorial/bigger-applications/),
[static files](https://fastapi.tiangolo.com/tutorial/static-files/),
[Anthropic Python SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/python),
and [Sonnet 5.5 model reference](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).
