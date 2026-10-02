# Networking Buddy — 5-Hour Hackathon Build Plan

Oct 2, 2026 · @Jackson Dearing

## What we're building

Networking Buddy is a Duolingo-style phone app that coaches students to build professional relationships and keep them alive. Practice games build the skills, in-person tasks put them to use, and an AI coach turns who you met into specific, genuine reasons to follow up.

**The core loop:** games build skills → in-person tasks put them to use → a quick reflection captures who you met → the coach writes personalized follow-up reminders → follow-ups earn the most points.

**In the MVP:**

- Four practice games running on one engine: elevator pitch, coffee chat, follow-up, cold call
- Streaks and XP, with games worth 10–20 XP and in-person tasks worth 50–100 XP
- In-person tasks that end with a two-question reflection, which creates or updates a contact
- A contact log of everyone you've met and what you talked about
- Personalized coach reminders and drafted messages, grounded in contacts, tasks, and game scores

**Cut for now:** login, push notifications, multiple users, and app store builds. A leaderboard with seeded friend data is the first stretch goal.

**Demo persona:** Alex, a BYU junior in CS targeting data engineering roles, with a 4-day streak, 340 XP, three contacts, and a few past game sessions already seeded.

**Golden-path demo (about 3 minutes):**

1. Open the app from the phone's home screen. The home screen shows the streak, XP, today's coach card, and open tasks.
2. The coach card suggests reaching out to Sarah (mom's friend, a BYU researcher) because her grant deadline just passed. Tap it to get a drafted message.
3. Play the coffee chat game. The AI plays a Utah tech engineer for 3–4 exchanges, then shows scores, one strength, and one fix. Earn 15 XP and keep the streak.
4. Complete the task "Attend the Qualtrics info session." The reflection asks who you met: "Marcus, data engineer, said his team is moving to dbt." A contact is created and Alex earns 75 XP.
5. Refresh the coach. A new card for Marcus suggests a small dbt project and a follow-up next week, and flags that Alex's coffee chats score low on specificity. This is the moment the whole loop closes live.

## Tech stack

Build a Progressive Web App (PWA) in plain HTML, CSS, and JavaScript, backed by a Python FastAPI server that calls Claude. One codebase installs to the home screen on iPhone and Android and runs in a laptop browser.

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Plain HTML/CSS/JS, no framework | The team knows some JS but no React. Jackson has already built a vanilla JS PWA. |
| App on phones | PWA via "Add to Home Screen" | Full-screen app icon on both platforms, no app store or build step. |
| Backend | Python + FastAPI | Jackson's strongest language. It also serves the frontend files, so there's one URL and no CORS setup. |
| Storage | One `db.json` file | Single demo user, easy to seed, inspect, and reset. |
| LLM | Claude via the `anthropic` Python SDK, model `claude-sonnet-5-5` | The API key stays on the server, never in the browser. |
| Phone access | `cloudflared` or `ngrok` HTTPS tunnel | Gives phones an HTTPS link to one laptop in under a minute. |
|  |  |  |

**Why not React Native or Expo:** learning React and a mobile toolchain in 5 hours is the most likely way to end up with nothing working. A PWA gets you a real-feeling app with skills you already have.

**Use AI coding help heavily.** Have Claude generate boilerplate such as the hash router, chat bubble CSS, and FastAPI routes, then spend your own time on the prompts and the polish judges will see.

API reference: [Claude API docs](https://docs.claude.com/en/api/overview).

## Architecture and data

One laptop runs FastAPI, which serves the app's files, stores data in `db.json`, and calls Claude. Phones reach it through an HTTPS tunnel.

&#91;embedded content: architecture · 2 clients, 1 server, storage and Claude\]

**File structure.** Each person owns separate files, which keeps merge conflicts rare.

```
networking-buddy/
  backend/
    main.py          # FastAPI app: routes, serves ../frontend      (Jackson)
    llm.py           # Claude calls: game turns, scoring, coach      (Jackson)
    games.py         # GAME_CONFIGS for the four games               (Jackson)
    db.py            # load_db(), save_db(), reset_db()              (Jackson)
    seed.json        # demo data; db.json is copied from it on reset
    requirements.txt # fastapi uvicorn anthropic python-dotenv
    .env             # ANTHROPIC_API_KEY — add to .gitignore
  frontend/
    index.html       # one <section> per screen
    styles.css
    app.js           # hash router + api() fetch helper             (Teammate B)
    home.js          # streak, XP, coach cards, task list           (Teammate B)
    contacts.js      # contact log + add contact                    (Teammate B)
    game.js          # chat UI + score screen                       (Teammate C)
    tasks.js         # task completion + reflection form            (Teammate C)
    manifest.json
    icons/icon-192.png, icons/icon-512.png
```

**Data model** (`seed.json`):

```json
{
  "user": {"name": "Alex", "school": "BYU", "major": "Computer Science",
           "target_roles": ["Data Engineer"], "xp": 340, "streak": 4,
           "last_active": "2026-10-01"},
  "contacts": [
    {"id": "c1", "name": "Sarah", "how_met": "Mom's friend",
     "company": "BYU", "role": "Research scientist",
     "notes": ["Grant deadline mid-October", "Lab website is outdated"],
     "last_contact": "2026-09-10"}
  ],
  "tasks": [
    {"id": "t1", "title": "Attend the Qualtrics info session",
     "type": "in_person", "xp": 75, "status": "open"}
  ],
  "game_sessions": [
    {"id": "g1", "game": "coffee_chat", "date": "2026-09-30",
     "scores": {"curiosity": 4, "specificity": 2, "rapport": 3}, "xp": 15}
  ]
}
```

**Streak rule:** on any XP-earning action, if `last_active` was yesterday, add 1 to the streak; if it was today, leave it; otherwise reset to 1. Then set `last_active` to today.

## API, game engine, and prompts

Eight endpoints cover the whole app, and all four games run through the same three game endpoints using a config per game.

| Method | Path | Request → response |
| --- | --- | --- |
| GET | `/api/state` | → user, contacts, open tasks, recent game sessions |
| POST | `/api/games/{game}/start` | → the persona's opening line plus the game's goal text |
| POST | `/api/games/{game}/turn` | `{history}` → the persona's next reply |
| POST | `/api/games/{game}/score` | `{history}` → `{scores, best_moment, one_fix, rewrite_example, xp}`; saves the session, updates XP and streak |
| POST | `/api/tasks/{id}/complete` | `{met_name, role, company, hook}` → new or updated contact, XP earned |
| POST | `/api/contacts` | `{name, how_met, company, role, notes}` → the saved contact |
| POST | `/api/coach/reminders` | → up to 3 reminder cards |
| POST | `/api/coach/draft` | `{contact_id, reason}` → a drafted message |

**Build stubs first.** Have every endpoint return hardcoded JSON in the right shape within the first hour, so the frontend never waits on the LLM work.

**Game configs** (`games.py`). Single-turn games (elevator pitch, follow-up) skip `/turn` and go straight to scoring.

```python
GAME_CONFIGS = {
    "elevator_pitch": {
        "title": "Elevator Pitch", "max_turns": 1, "xp": 10,
        "persona": "a recruiter at a busy career fair booth with 30 seconds to spare",
        "goal": "Introduce yourself: who you are, something you've built, what you're looking for.",
        "rubric": ["clarity", "memorability", "relevance"],
    },
    "coffee_chat": {
        "title": "Coffee Chat", "max_turns": 4, "xp": 15,
        "persona": "a software engineer at a Utah tech company who agreed to a 15-minute coffee chat",
        "goal": "Learn about their work and leave with a natural reason to follow up.",
        "rubric": ["curiosity", "specificity", "rapport"],
    },
    "follow_up": {
        "title": "Follow-Up", "max_turns": 1, "xp": 10,
        "persona": "a data engineer the student met at an info session 10 days ago, who mentioned their team is moving to dbt",
        "goal": "Write a follow-up message that gives them a genuine reason to reply.",
        "rubric": ["specificity", "value_to_them", "low_pressure"],
    },
    "cold_call": {
        "title": "Cold Outreach", "max_turns": 3, "xp": 20,
        "persona": "a busy hiring manager who has never met the student",
        "goal": "Earn a reply and a small, specific next step without wasting their time.",
        "rubric": ["hook", "respect_for_time", "clear_ask"],
    },
}
```

**Calling Claude** (`llm.py`):

````python
import json
from anthropic import Anthropic

client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment
MODEL = "claude-sonnet-5-5"

def ask_claude(system, messages, max_tokens=800):
    resp = client.messages.create(model=MODEL, max_tokens=max_tokens,
                                  system=system, messages=messages)
    return resp.content[0].text

def ask_claude_json(system, messages, fallback):
    for _ in range(2):  # one retry
        text = ask_claude(system, messages)
        text = text.replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            continue
    return fallback
````

In game history, the student is the `user` role and the persona is `assistant`. Because the API expects the first message to come from `user`, start each game by sending a user message such as `[The student walks up to you.]`.

**Persona prompt** (system, for `/start` and `/turn`):

```
You are roleplaying {persona} in a networking practice game for a university
student. Stay in character the whole time. Be realistic: friendly but busy,
and react to what the student actually says. If they're vague, be a little
vague back. If they ask a good question, open up. Keep each reply to 2-3
sentences. Never coach the student or break character.
```

**Scoring prompt** (system, for `/score`):

```
You are a career coach scoring a university student's networking practice.
Game: {title}. The student's goal: {goal}.
Score each dimension from 1 to 5: {rubric}.
Be honest. A 5 is rare and means a professional would be impressed.
Return ONLY JSON, no other text:
{"scores": {"<dimension>": <int>, ...},
 "best_moment": "<one sentence quoting or describing what worked>",
 "one_fix": "<the single change that would help most>",
 "rewrite_example": "<how one of their lines could have sounded>"}
```

Send the transcript as the user message. XP is computed in Python, not by the model.

**Coach reminder prompt** (system, for `/coach/reminders`). Build one context object from the user profile, every contact with notes and `last_contact`, completed tasks, average score per rubric dimension, and today's date, then send it as JSON in the user message.

```
You are a networking coach for a university student. Using the context,
pick up to 3 contacts most worth reaching out to right now. For each, give
a specific, genuine reason grounded in their notes or what's happened since
you last talked. Never suggest a generic check-in. Good reasons: asking a
follow-up question about their advice, sharing a project related to what
they mentioned, congratulating them on something they were working toward.
If the student's game scores show a weak dimension, add a short tip.
Return ONLY JSON:
{"reminders": [{"contact_id": "...", "headline": "<under 8 words>",
  "reason": "<1-2 sentences>", "suggested_action": "<one concrete step>",
  "tip": "<optional>"}]}
```

**Draft prompt** (system, for `/coach/draft`):

```
Write a short message from the student to this contact. Under 80 words,
friendly and professional, specific to their notes and the reason given.
End with one easy, low-pressure question. Never write "just checking in."
Return only the message text.
```

## Team roles

Jackson owns the backend and every prompt, while the two teammates split the frontend by screen, so nobody edits the same file. Times are hours into the 5-hour build.

**Jackson — backend and LLM**

- [ ] 0:30 FastAPI skeleton serving `frontend/`, plus `/api/state` reading `db.json`
- [ ] 1:00 All eight endpoints returning stub JSON in the final shapes
- [ ] 1:45 Real game engine: `/start`, `/turn`, `/score` working for coffee chat
- [ ] 2:15 Other three games tested; scoring tuned on 3–4 sample transcripts (one weak, one strong)
- [ ] 2:45 Coach reminders and drafts live, tested against the seed data
- [ ] 3:45 `DEMO_MODE` flag that returns saved responses for the exact demo inputs, plus a `/api/reset` route

**Teammate B — home, coach, and contacts**

- [ ] 0:30 `index.html` with a `<section>` per screen, `app.js` hash router, and an `api()` fetch helper
- [ ] 1:30 Home screen: streak flame, XP bar, coach cards, task list, game picker, all from `/api/state`
- [ ] 2:15 Coach card tap → drafted message in a sheet with a Copy button
- [ ] 2:45 Contacts screen: list, notes, and an add-contact form
- [ ] 3:15 XP gain animation and a streak "+1" moment

**Teammate C — games, tasks, and app polish**

- [ ] 1:30 Game screen: chat bubbles, text input, turn counter, a "Finish" button that calls `/score`
- [ ] 2:00 Score screen: a bar per rubric dimension, best moment, one fix, XP earned
- [ ] 2:30 Task completion: the reflection form (who did you meet, their role and company, one thing to follow up on)
- [ ] 3:00 PWA setup: `manifest.json`, icons, meta tags, tunnel running, installed on all three phones
- [ ] 3:45 Visual polish pass, then start the pitch slides

**Visual style for B and C to share:** one bright brand color, big rounded buttons, chunky bold type, and generous spacing. Design for a 390px-wide phone screen and cap the layout at 480px wide so it looks right on laptops.

## Timeline

Each person works in parallel from 0:30 to the 3:45 freeze, and two checkpoints decide whether you keep building or stop to fix.

&#91;embedded content: build timeline · 16 tasks, 2 checkpoints, 1 freeze\]

If the golden path isn't working at 2:00, everyone helps integrate before starting anything new. If the app isn't running on phones at 3:00, skip the stretch goals and demo on a laptop.

## Getting it on phones and laptops

Run the server on one laptop, expose it with an HTTPS tunnel, and add the link to each phone's home screen. Set this up by hour 3 so any phone-only bugs surface early.

1. Start the server from `backend/`: `uvicorn main:app --host 0.0.0.0 --port 8000`.
2. Open a tunnel. `cloudflared tunnel --url http://localhost:8000` needs no account. `ngrok http 8000` works too but needs a free signup and auth token. Either one prints an `https://` link.
3. **iPhone:** open the link in Safari, tap Share, then "Add to Home Screen."
4. **Android:** open the link in Chrome, tap the ⋮ menu, then "Add to Home screen" or "Install app."
5. **Laptop:** open `http://localhost:8000` in Chrome and turn on DevTools device mode (Ctrl/Cmd+Shift+M) to show it in a phone frame. To show a real phone on a projector, mirror it: QuickTime for an iPhone on a Mac, or `scrcpy` for Android.

**Add these to `index.html`** so the home-screen icon opens full-screen:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#58CC02">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
```

**`manifest.json`:**

```json
{
  "name": "Networking Buddy",
  "short_name": "Buddy",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#58CC02",
  "icons": [
    {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"}
  ]
}
```

Skip the service worker and offline caching. They aren't needed for the demo and are a common source of stale-file bugs. If Android won't offer "Install app," "Add to Home screen" still works.

**Watch out:** a free tunnel's link changes every time it restarts, and the home-screen icon points to the old one. Start the tunnel once for the final hour and don't restart it before the demo.

## Risks, fallbacks, and demo checklist

The demo is the product today, so every risk has a fallback that keeps the golden path working.

| Risk | Fallback |
| --- | --- |
| Claude is slow or errors mid-demo | `DEMO_MODE=1` returns saved responses for the scripted inputs |
| Claude returns malformed JSON | Strip fences, retry once, then return a canned fallback (`ask_claude_json`) |
| Venue wifi blocks the tunnel | Switch the laptop to a phone hotspot, or demo on the laptop at `localhost` |
| Frontend blocked waiting on backend | Stub endpoints are live by hour 1 |
| Merge conflicts | One owner per file, as in the file structure above |
| API key leaks to GitHub | Key lives in `.env`, which is in `.gitignore` |
| Running out of time | Cut in this order: leaderboard, cold call game, contact editing, XP animations |

**Before you present:**

- [ ] Hit `/api/reset` so the seed data is fresh
- [ ] App installed and opening full-screen on all three phones
- [ ] Golden path run start to finish three times, once with `DEMO_MODE` on
- [ ] Backup screen recording of the full demo saved on two laptops
- [ ] Pitch order set: problem → your two real stories → insight → live demo → the loop → what's next
- [ ] Answer ready for "How is this different from LinkedIn or Clay?" (they find strangers or manage existing networks; this builds the habit and gives students something worth saying)
- [ ] Answer ready for "Can't people fake in-person tasks?" (reflections add friction, and the real payoff is the relationship, not the points)
- [ ] "What's next" slide: real event feeds, push notifications, and campus career center partnerships
