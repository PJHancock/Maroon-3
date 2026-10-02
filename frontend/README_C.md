# Nudge frontend

## Test Teammate C independently

The standalone harness does not need FastAPI, Claude, Teammate A's backend, or Teammate B's router.

The main test surface is the daily connection plan: the streak, one real-world action, and tasks with different difficulty and XP. Practice games are intentionally shown as optional side quests.

From the repository root, run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/frontend/dev/c-harness_C.html
```

The harness uses `frontend/dev/mock-api_C.js`, which implements the same endpoint paths and payloads as the planned backend:

- `GET /api/state`
- `POST /api/games/{game}/start`
- `POST /api/games/{game}/turn`
- `POST /api/games/{game}/score`
- `POST /api/tasks/{id}/complete`

Use **Enable mock errors** to verify retry states, and **Reset mock state** before repeating the demo.

The seeded connection options include attending an in-person event, setting up a personal chat, reaching out to someone new online, making a call, attending a nearby event, and following up. The nearby-event task is marked so Teammate A can later connect it to an AI-powered event search.

## Integration seam

Teammate A or B can replace the mock adapter with the real API by assigning:

```js
window.NetworkingBuddy.api = api;
```

The game and task modules do not call `fetch` directly. They use this adapter and dispatch `networking-buddy:state-changed` after a task or game earns XP.

## LLM context contract

Before a game starts, `game_C.js` reads `/api/state` and sends a privacy-scoped context object to Teammate A:

```json
{
  "user": {
    "name": "Alex",
    "school": "BYU",
    "major": "Computer Science",
    "target_roles": ["Data Engineer"]
  },
  "contacts": [
    {
      "id": "c1",
      "name": "Sarah",
      "role": "Research scientist",
      "company": "BYU",
      "notes": ["Grant deadline mid-October"],
      "last_contact": "2026-09-10"
    }
  ],
  "open_tasks": [],
  "recent_game_sessions": []
}
```

That context is sent with `/start`, `/turn`, and `/score`. The backend can use it to roleplay someone relevant to the user's goals, ask follow-up questions that connect to remembered details, and return an optional `recommended_follow_up` field on `/score`.
