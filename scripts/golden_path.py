"""Exercise the actual HTTP demo with Python's standard library.

Start the server first. This resets demo data by design.
    python scripts/golden_path.py --reset
"""

import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LINES = (
    "I'm a BYU CS junior interested in data engineering. What does your team work on?",
    "What does a typical day look like?",
    "What skills would you recommend I practice?",
    "Thanks for the advice! Could I send you a small project next week?",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--reset", action="store_true", required=True, help="Acknowledge replacing current demo data with the seed")
    args = parser.parse_args()

    def api(path, body=None, method="POST"):
        data = json.dumps(body or {}).encode() if method == "POST" else None
        request = Request(args.url.rstrip("/") + path, data=data, method=method,
                          headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=30) as response:
            return json.load(response)

    try:
        api("/api/reset")
        before = api("/api/state", method="GET")
        cards = api("/api/coach/reminders")["reminders"]
        draft = api("/api/coach/draft", {"contact_id": cards[0]["contact_id"], "reason": cards[0]["reason"]})
        start = api("/api/games/coffee_chat/start")
        history = [{"role": "assistant", "content": start["reply"]}]
        for line in LINES:
            history.append({"role": "user", "content": line})
            reply = api("/api/games/coffee_chat/turn", {"history": history, "session_id": start["session_id"]})
            history.append({"role": "assistant", "content": reply["reply"]})
        request = {"history": history, "session_id": start["session_id"]}
        score = api("/api/games/coffee_chat/score", request)
        retry = api("/api/games/coffee_chat/score", request)
        reflection = {"met_name": "Marcus", "role": "Data engineer", "company": "Qualtrics", "hook": "His team is moving to dbt"}
        task = api("/api/tasks/t1/complete", reflection)
        task_retry = api("/api/tasks/t1/complete", reflection)
        cards_after = api("/api/coach/reminders")["reminders"]
        after = api("/api/state", method="GET")
        assert after["user"]["xp"] == before["user"]["xp"] + 90
        assert retry["xp_awarded"] == task_retry["xp_awarded"] == 0
        assert after["user"]["streak"] == 5
        assert len(after["contacts"]) == 4
        if after["mode"] == "demo":
            assert cards[0]["contact_id"] == "c1"
            assert cards_after[0]["contact_id"] == task["contact"]["id"]
            assert "dbt" in cards_after[0]["reason"]
        print(json.dumps({"result": "PASS", "mode": after["mode"],
                          "xp": after["user"]["xp"], "streak": after["user"]["streak"],
                          "scores": score["scores"], "initial_draft": draft["draft"],
                          "new_contact": task["contact"]["name"], "new_coach_card": cards_after[0]}, indent=2))
    except (HTTPError, URLError, TimeoutError) as error:
        parser.exit(1, f"HTTP check failed: {error}\nStart the backend in demo mode first.\n")


if __name__ == "__main__":
    main()
