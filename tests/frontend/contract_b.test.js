// Contract tests: response shapes from the build plan's API table.
// By default they run against the in-browser mock. To check Jackson's real
// server, start it and run:   API_BASE=http://localhost:8000 npm test
// (Live mode only calls read-only endpoints, plus the coach, which calls Claude.)

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { api, post, setMockMode } from "../../frontend/app_b.js";
import { resetMock, setMockDelay, applyXp } from "../../frontend/mock_b.js";

const LIVE = process.env.API_BASE;

before(() => {
  setMockDelay(0);
  resetMock();
  setMockMode(!LIVE);
  if (LIVE) {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (path, opts) => realFetch(new URL(path, LIVE), opts);
  }
});

const isStr = (x) => typeof x === "string";
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

function checkContact(c) {
  assert.ok(isStr(c.id), "contact.id");
  assert.ok(isStr(c.name), "contact.name");
  assert.ok(Array.isArray(c.notes ?? []), "contact.notes is a list");
}

test("GET /api/state", async () => {
  const s = await api("/api/state");
  assert.ok(isStr(s.user.name), "user.name");
  assert.ok(isNum(s.user.xp), "user.xp");
  assert.ok(isNum(s.user.streak), "user.streak");
  assert.ok(Array.isArray(s.contacts), "contacts");
  s.contacts.forEach(checkContact);
  assert.ok(Array.isArray(s.tasks), "tasks");
  for (const t of s.tasks) {
    assert.ok(isStr(t.id) && isStr(t.title) && isNum(t.xp), "task id/title/xp");
  }
  assert.ok(Array.isArray(s.game_sessions), "game_sessions");
});

test("POST /api/coach/reminders", async () => {
  const r = await post("/api/coach/reminders");
  assert.ok(Array.isArray(r.reminders), "reminders list");
  assert.ok(r.reminders.length <= 3, "at most 3");
  const ids = new Set((await api("/api/state")).contacts.map((c) => c.id));
  for (const card of r.reminders) {
    assert.ok(ids.has(card.contact_id), `contact_id ${card.contact_id} exists`);
    assert.ok(isStr(card.headline) && isStr(card.reason) && isStr(card.suggested_action), "card text");
  }
});

test("POST /api/coach/draft", async () => {
  const d = await post("/api/coach/draft", { contact_id: "c1", reason: "Her grant deadline passed" });
  const text = typeof d === "string" ? d : d.message ?? d.draft ?? d.text;
  assert.ok(isStr(text) && text.length > 0, "draft text");
});

// The rest change data, so they only run against the mock.
const mockOnly = { skip: LIVE ? "mutates data; mock only" : false };

test("POST /api/contacts", mockOnly, async () => {
  const c = await post("/api/contacts", {
    name: "Marcus", how_met: "Info session", last_contact: "2026-09-28", company: "Qualtrics", role: "DE",
    phone: "801-555-0123", email: "marcus@qualtrics.com", notes: ["dbt"],
  });
  checkContact(c);
  assert.equal(c.name, "Marcus");
  assert.equal(c.last_contact, "2026-09-28", "date from the form is kept");
  assert.equal(c.phone, "801-555-0123", "phone is kept");
  assert.equal(c.email, "marcus@qualtrics.com", "email is kept");
});

test("POST /api/tasks/{id}/complete", mockOnly, async () => {
  const r = await post("/api/tasks/t1/complete", { met_name: "Marcus", role: "Data engineer", company: "Qualtrics", hook: "dbt" });
  checkContact(r.contact);
  assert.ok(isNum(r.xp));
});

test("POST /api/games/{game}/start, turn, score", mockOnly, async () => {
  const s = await post("/api/games/coffee_chat/start");
  assert.ok(isStr(s.opening) && isStr(s.goal));
  const t = await post("/api/games/coffee_chat/turn", { history: [] });
  assert.ok(isStr(t.reply));
  const sc = await post("/api/games/coffee_chat/score", { history: [] });
  for (const k of ["best_moment", "one_fix", "rewrite_example"]) assert.ok(isStr(sc[k]), k);
  assert.ok(isNum(sc.xp));
  assert.ok(Object.values(sc.scores).every((v) => Number.isInteger(v) && v >= 1 && v <= 5), "scores 1-5");
});

test("streak rule: yesterday +1, today unchanged, older resets", mockOnly, () => {
  const u = (last) => ({ xp: 0, streak: 4, last_active: last });
  const a = u("2026-10-01"); applyXp(a, 10, "2026-10-02");
  assert.equal(a.streak, 5);
  const b = u("2026-10-02"); applyXp(b, 10, "2026-10-02");
  assert.equal(b.streak, 4);
  const c = u("2026-09-20"); applyXp(c, 10, "2026-10-02");
  assert.equal(c.streak, 1);
  assert.equal(c.last_active, "2026-10-02");
  assert.equal(c.xp, 10);
  const d = u("2026-09-30"); applyXp(d, 10, "2026-10-01"); // month boundary
  assert.equal(d.streak, 5);
});
