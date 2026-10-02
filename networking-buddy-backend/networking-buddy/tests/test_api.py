"""HTTP integration tests. Install requirements-dev.txt before running these."""

import importlib.util
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

if not all(importlib.util.find_spec(name) for name in ("fastapi", "httpx", "dotenv")):
    raise unittest.SkipTest("HTTP tests require backend/requirements-dev.txt")

from fastapi.testclient import TestClient

from backend.config import Settings
from backend.demo import DEMO_COFFEE_LINES
from backend.main import create_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.frontend = self.root / "frontend"
        self.frontend.mkdir()
        self.settings = Settings(db_path=self.root / "db.json", frontend_dir=self.frontend)
        self.client = TestClient(create_app(self.settings))
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def post(self, path, body=None):
        result = self.client.post(path, json=body) if body is not None else self.client.post(path)
        self.assertIn(result.status_code, (200, 201), result.text)
        return result.json()

    def test_golden_path_over_http(self):
        self.post("/api/reset")
        state = self.client.get("/api/state").json()
        self.assertEqual(state["user"]["xp"], 340)
        reminders = self.post("/api/coach/reminders")["reminders"]
        self.assertEqual(reminders[0]["contact_id"], "c1")
        draft = self.post("/api/coach/draft", {"contact_id": "c1", "reason": reminders[0]["reason"]})
        self.assertIn("draft", draft)
        start = self.post("/api/games/coffee_chat/start")
        history = [{"role": "assistant", "content": start["reply"]}]
        for i, line in enumerate(DEMO_COFFEE_LINES, 1):
            history.append({"role": "user", "content": line})
            turn = self.post("/api/games/coffee_chat/turn", {"history": history, "session_id": start["session_id"]})
            self.assertEqual(turn["turns_remaining"], 4 - i)
            history.append({"role": "assistant", "content": turn["reply"]})
        request = {"history": history, "session_id": start["session_id"]}
        score = self.post("/api/games/coffee_chat/score", request)
        self.assertEqual((score["xp_awarded"], score["user"]["xp"]), (15, 355))
        self.assertEqual(self.post("/api/games/coffee_chat/score", request)["xp_awarded"], 0)
        task = self.post("/api/tasks/t1/complete", {
            "met_name": "Marcus", "role": "Data engineer", "company": "Qualtrics",
            "hook": "His team is moving to dbt",
        })
        self.assertEqual((task["user"]["xp"], task["user"]["streak"]), (430, 5))
        after = self.post("/api/coach/reminders")["reminders"]
        self.assertEqual(after[0]["contact_id"], task["contact"]["id"])
        self.assertIn("specificity", after[0]["tip"])

    def test_all_four_games_and_legacy_payloads(self):
        for name in ("elevator_pitch", "coffee_chat", "follow_up", "cold_call"):
            with self.subTest(game=name):
                start = self.post(f"/api/games/{name}/start")
                self.assertIn("goal", start)
                history = [{"role": "user", "content": "Could I send a dbt project with tests?"}]
                score = self.post(f"/api/games/{name}/score", {"history": history})
                self.assertEqual(set(score["scores"]), set(start["rubric"]))

    def test_contact_contract(self):
        result = self.client.post("/api/contacts", json={"name": "Jamie", "notes": ["Discussed pipelines"]})
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.json()["name"], "Jamie")
        self.assertEqual(len(self.client.get("/api/state").json()["contacts"]), 4)

    def test_validation_and_not_found_are_json(self):
        for path, body, status in [
            ("/api/games/nope/start", None, 404),
            ("/api/games/coffee_chat/score", {"history": []}, 422),
            ("/api/games/coffee_chat/turn", {"history": [{"role": "system", "content": "Hi"}]}, 422),
            ("/api/tasks/t1/complete", {"met_name": "Marcus", "hook": " "}, 422),
            ("/api/tasks/nope/complete", {"met_name": "Marcus", "hook": "dbt"}, 404),
            ("/api/coach/draft", {"contact_id": "nope", "reason": "dbt"}, 404),
        ]:
            with self.subTest(path=path):
                result = self.client.post(path, json=body)
                self.assertEqual(result.status_code, status, result.text)
                self.assertIn("detail", result.json())
                self.assertIn("code", result.json())
        result = self.client.get("/api/typo")
        self.assertEqual(result.status_code, 404)
        self.assertEqual(result.json()["code"], "route_not_found")

    def test_frontend_is_served_without_exposing_backend(self):
        self.assertIn("Backend ready", self.client.get("/").text)
        (self.frontend / "index.html").write_text("<!doctype html><title>Teammates' app</title>")
        (self.frontend / "app.js").write_text("console.log('loaded');")
        self.assertIn("Teammates' app", self.client.get("/").text)
        self.assertIn("loaded", self.client.get("/app.js").text)
        for path in ("/backend/.env", "/backend/db.json", "/seed.json"):
            self.assertEqual(self.client.get(path).status_code, 404)

    def test_openapi_has_typed_contracts(self):
        schema = self.client.get("/openapi.json").json()
        self.assertIn("/api/games/{game}/score", schema["paths"])
        self.assertIn("ScoreResponse", schema["components"]["schemas"])
        self.assertEqual(self.client.get("/docs").status_code, 200)

    def test_api_state_is_not_cached_and_health_has_no_key(self):
        response = self.client.get("/api/state")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(self.client.get("/api/health").json(), {"status": "ok", "mode": "demo"})

    def test_reset_can_be_disabled(self):
        settings = replace(self.settings, allow_reset=False, db_path=self.root / "another.json")
        with TestClient(create_app(settings)) as client:
            self.assertEqual(client.post("/api/reset").status_code, 403)

    def test_cors_is_opt_in(self):
        headers = {"Origin": "http://localhost:5500", "Access-Control-Request-Method": "POST"}
        self.assertNotIn("access-control-allow-origin", self.client.options("/api/contacts", headers=headers).headers)
        settings = replace(self.settings, cors_origins=("http://localhost:5500",), db_path=self.root / "cors.json")
        with TestClient(create_app(settings)) as client:
            result = client.options("/api/contacts", headers=headers)
            self.assertEqual(result.headers["access-control-allow-origin"], "http://localhost:5500")


if __name__ == "__main__":
    unittest.main()
