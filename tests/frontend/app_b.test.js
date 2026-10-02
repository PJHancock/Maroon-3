import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  parseRoute, esc, daysSince, todayISO, normalizeState, computeCelebration,
  api, post, ApiError, setMockMode, registerScreen, getScreen, celebrate, _setState, getState,
  applyDebugXp, isDebugMode,
} from "../../frontend/app_b.js";
import { resetMock, setMockDelay } from "../../frontend/mock_b.js";

const realFetch = globalThis.fetch;

beforeEach(() => {
  setMockMode(false);
  setMockDelay(0);
  resetMock();
  _setState(null);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fakeFetch(status, body, { raw = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const text = raw ? body : body === undefined ? "" : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, statusText: "ERR", text: async () => text };
  };
  return calls;
}

// ---------- router ----------

test("parseRoute: empty and root go home", () => {
  assert.deepEqual(parseRoute(""), { name: "home", id: null });
  assert.deepEqual(parseRoute("#"), { name: "home", id: null });
  assert.deepEqual(parseRoute("#/"), { name: "home", id: null });
  assert.deepEqual(parseRoute(undefined), { name: "home", id: null });
});

test("parseRoute: screens with and without ids", () => {
  assert.deepEqual(parseRoute("#/contacts"), { name: "contacts", id: null });
  assert.deepEqual(parseRoute("#/game/coffee_chat"), { name: "game", id: "coffee_chat" });
  assert.deepEqual(parseRoute("#/task/t1"), { name: "task", id: "t1" });
  assert.deepEqual(parseRoute("#/score"), { name: "score", id: null });
});

test("parseRoute: tolerant of missing slash, trailing slash, query, encoding", () => {
  assert.deepEqual(parseRoute("#game/cold_call/"), { name: "game", id: "cold_call" });
  assert.deepEqual(parseRoute("#/task/t%201?x=1"), { name: "task", id: "t 1" });
});

test("parseRoute: unknown screens fall back to home", () => {
  assert.deepEqual(parseRoute("#/nope/1"), { name: "home", id: null });
});

test("registerScreen stores screens for the router", () => {
  const screen = { show() {} };
  registerScreen("score", screen);
  assert.equal(getScreen("score"), screen);
});

// ---------- utilities ----------

test("esc escapes HTML and handles null", () => {
  assert.equal(esc(`<b a="1">&'</b>`), "&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(42), "42");
});

test("todayISO pads month and day", () => {
  assert.equal(todayISO(new Date(2026, 0, 5)), "2026-01-05");
});

test("daysSince counts whole days and rejects junk", () => {
  assert.equal(daysSince("2026-09-10", "2026-10-02"), 22);
  assert.equal(daysSince("2026-10-02", "2026-10-02"), 0);
  assert.equal(daysSince("2026-10-01T23:59:00", "2026-10-02"), 1);
  assert.equal(daysSince(null, "2026-10-02"), null);
  assert.equal(daysSince("garbage", "2026-10-02"), null);
});

// ---------- normalizeState ----------

test("normalizeState fills safe defaults for an empty response", () => {
  const s = normalizeState(undefined);
  assert.deepEqual(s.contacts, []);
  assert.deepEqual(s.tasks, []);
  assert.deepEqual(s.game_sessions, []);
  assert.equal(s.user.xp, 0);
  assert.equal(s.user.streak, 0);
  assert.equal(s.user.name, "You");
});

test("normalizeState keeps extra fields and accepts open_tasks", () => {
  const s = normalizeState({ user: { name: "Alex", xp: "340", streak: 4 }, open_tasks: [{ id: "t1" }], leaderboard: [1] });
  assert.equal(s.user.xp, 340);
  assert.equal(s.tasks[0].id, "t1");
  assert.deepEqual(s.leaderboard, [1]);
});

// ---------- api ----------

test("api GETs JSON when there's no body", async () => {
  const calls = fakeFetch(200, { ok: 1 });
  assert.deepEqual(await api("/api/state"), { ok: 1 });
  assert.equal(calls[0].url, "/api/state");
  assert.equal(calls[0].opts.method, "GET");
  assert.equal(calls[0].opts.body, undefined);
});

test("post sends a JSON body", async () => {
  const calls = fakeFetch(200, { id: "c9" });
  await post("/api/contacts", { name: "Marcus" });
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].opts.body), { name: "Marcus" });
});

test("post with no body still sends {}", async () => {
  const calls = fakeFetch(200, { reminders: [] });
  await post("/api/coach/reminders");
  assert.equal(calls[0].opts.body, "{}");
});

test("api throws ApiError with FastAPI's detail on HTTP errors", async () => {
  fakeFetch(404, { detail: "Task not found" });
  await assert.rejects(api("/api/tasks/x/complete", { method: "POST", body: {} }), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    assert.match(err.message, /Task not found/);
    return true;
  });
});

test("api throws ApiError on non-JSON responses", async () => {
  fakeFetch(500, "Internal Server Error", { raw: true });
  await assert.rejects(api("/api/state"), (err) => err instanceof ApiError && err.status === 500);
});

test("api throws ApiError when the server is unreachable", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(api("/api/state"), (err) => err instanceof ApiError && err.status === 0);
});

test("api returns null for an empty 200 body", async () => {
  fakeFetch(200, undefined);
  assert.equal(await api("/api/reset", { method: "POST" }), null);
});

test("mock mode skips fetch entirely", async () => {
  globalThis.fetch = async () => { throw new Error("should not be called"); };
  setMockMode(true);
  const s = await api("/api/state");
  assert.equal(s.user.name, "Alex");
});

test("mock mode turns unknown routes into ApiError 404", async () => {
  setMockMode(true);
  await assert.rejects(api("/api/nope"), (err) => err instanceof ApiError && err.status === 404);
});

// ---------- celebrate ----------

test("computeCelebration uses xpGained when given", () => {
  const c = computeCelebration({ user: { xp: 340, streak: 4 } }, { user: { xp: 415, streak: 5 } }, 75);
  assert.deepEqual(c, { xp: 75, streakUp: true, streak: 5 });
});

test("computeCelebration falls back to the XP difference", () => {
  const c = computeCelebration({ user: { xp: 340, streak: 5 } }, { user: { xp: 355, streak: 5 } });
  assert.deepEqual(c, { xp: 15, streakUp: false, streak: 5 });
});

test("computeCelebration survives missing state", () => {
  assert.deepEqual(computeCelebration(null, null), { xp: 0, streakUp: false, streak: 0 });
});

test("applyDebugXp adds XP locally without mutating the input", () => {
  const before = { user: { name: "Alex", xp: 340, streak: 4 }, contacts: [{ id: "c1" }] };
  const { state, celebration } = applyDebugXp(before, 75);
  assert.equal(state.user.xp, 415);
  assert.equal(state.user.streak, 4);
  assert.equal(state.contacts.length, 1);
  assert.equal(before.user.xp, 340);
  assert.deepEqual(celebration, { xp: 75, streakUp: false, streak: 4 });
});

test("applyDebugXp can bump the streak and works with no state", () => {
  assert.deepEqual(applyDebugXp({ user: { xp: 0, streak: 4 } }, 15, { streak: true }).celebration,
    { xp: 15, streakUp: true, streak: 5 });
  assert.equal(applyDebugXp(null, 10).state.user.xp, 10);
});

test("isDebugMode is off without ?debug=1", () => {
  assert.equal(isDebugMode(), false);
});

test("celebrate refreshes state after an XP action (mock backend)", async () => {
  setMockMode(true);
  _setState(await api("/api/state"));
  const before = getState().user.xp;
  const res = await post("/api/games/coffee_chat/score", { history: [] });
  const c = await celebrate(res.xp);
  assert.equal(c.xp, 15);
  assert.equal(getState().user.xp, before + 15);
});
