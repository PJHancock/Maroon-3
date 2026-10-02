// Contract tests: response shapes from the build plan's API table.
// By default they run against the in-browser mock. To check Jackson's real
// server, start it and run:   API_BASE=http://localhost:8000 npm test
// Add API_MUTATE=1 to also run the tests that change data (use a scratch db).

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { api, post, setMockMode } from "../../frontend/app.js";
import { resetMock, setMockDelay, awardConnectionXp } from "../../frontend/mock.js";

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

// The rest change data. Against a live server they only run with API_MUTATE=1
// (point the backend at a scratch db first: NETWORKING_BUDDY_DB=/tmp/db.json).
const MUTATE = !LIVE || process.env.API_MUTATE === "1";
const mutating = { skip: MUTATE ? false : "mutates data; set API_MUTATE=1 to run live" };

test("POST /api/reset", mutating, async () => {
  await post("/api/reset");
  const s = await api("/api/state");
  assert.equal(s.user.xp, 340);
  assert.equal(s.contacts.length, 3);
});

test("POST /api/contacts keeps date, phone, and email", mutating, async () => {
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

test("POST /api/contacts rejects a future date", mutating, async () => {
  await assert.rejects(post("/api/contacts", { name: "Z", last_contact: "2999-01-01" }), (e) => e.status === 422);
});

test("POST /api/tasks/{id}/complete", mutating, async () => {
  await post("/api/reset");
  const r = await post("/api/tasks/t1/complete", { met_name: "Marcus", role: "Data engineer", company: "Qualtrics", hook: "Team moving to dbt" });
  checkContact(r.contact);
  assert.equal(r.contact.name, "Marcus");
  assert.equal(r.xp_earned, 75);
  assert.ok(isNum(r.streak));
  const s = await api("/api/state");
  assert.equal(s.tasks.find((t) => t.id === "t1").status, "complete");
  assert.ok(!s.open_tasks.some((t) => t.id === "t1"), "open_tasks drops it");
  assert.equal(s.user.today_connection_done, true);
  await assert.rejects(post("/api/tasks/t1/complete", { met_name: "M", hook: "h" }), (e) => e.status === 409);
});

test("POST /api/games/{game}/start, turn, score", mutating, async () => {
  const before = (await api("/api/state")).user;
  const s = await post("/api/games/coffee_chat/start", { context: {} });
  assert.ok(isStr(s.opening_line) && isStr(s.goal) && isStr(s.title));
  assert.equal(s.max_turns, 4);
  const t = await post("/api/games/coffee_chat/turn", { history: [{ role: "user", content: "Hi" }], context: {} });
  assert.ok(isStr(t.reply));
  const sc = await post("/api/games/coffee_chat/score", { history: [{ role: "user", content: "Hi" }], context: {} });
  for (const k of ["best_moment", "one_fix", "rewrite_example"]) assert.ok(isStr(sc[k]), k);
  assert.equal(sc.xp, 15);
  assert.ok(Object.values(sc.scores).every((v) => Number.isInteger(v) && v >= 1 && v <= 5), "scores 1-5");
  const after = (await api("/api/state")).user;
  assert.equal(after.xp, before.xp + 15, "games add XP");
  assert.equal(after.streak, before.streak, "games don't move the streak");
});

test("unknown game is a 404", mutating, async () => {
  await assert.rejects(post("/api/games/nope/start", {}), (e) => e.status === 404);
});

test("streak rule (mock mirrors backend award_connection_xp)", { skip: LIVE ? "mock-only unit test" : false }, () => {
  const u = (last) => ({ xp: 0, streak: 4, last_active: last, today_connection_done: false });
  const a = u("2026-10-01"); awardConnectionXp(a, 10, "2026-10-02");
  assert.equal(a.streak, 5);
  assert.equal(a.today_connection_done, true);
  const b = u("2026-10-02"); awardConnectionXp(b, 10, "2026-10-02");
  assert.equal(b.streak, 4);
  const c = u("2026-09-20"); awardConnectionXp(c, 10, "2026-10-02");
  assert.equal(c.streak, 1);
  assert.equal(c.last_active, "2026-10-02");
  assert.equal(c.xp, 10);
  const d = u("2026-09-30"); awardConnectionXp(d, 10, "2026-10-01"); // month boundary
  assert.equal(d.streak, 5);
});
