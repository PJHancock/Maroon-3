import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  GAMES, xpProgress, renderStats, renderGreeting, joinReminders, renderCoachCards,
  renderCoachError, renderTasks, renderGamePicker, renderHome, normalizeDraft,
  renderDraftSheet, loadReminders, _resetCoachCache,
} from "../../frontend/home.js";
import { setMockMode, normalizeState } from "../../frontend/app.js";
import { SEED, resetMock, setMockDelay, MOCK_GAMES } from "../../frontend/mock.js";

const contacts = SEED.contacts;

beforeEach(() => {
  setMockMode(true);
  setMockDelay(0);
  resetMock();
  _resetCoachCache();
});

test("xpProgress: Alex at 340 XP is level 4, 40% in", () => {
  assert.deepEqual(xpProgress(340), { level: 4, into: 40, perLevel: 100, pct: 40 });
});

test("xpProgress handles 0, negatives, and junk", () => {
  assert.equal(xpProgress(0).level, 1);
  assert.equal(xpProgress(-5).into, 0);
  assert.equal(xpProgress("abc").pct, 0);
});

test("renderStats shows the streak and XP", () => {
  const html = renderStats({ xp: 340, streak: 4 });
  assert.match(html, /streak-num">4</);
  assert.match(html, /340 XP/);
  assert.match(html, /width:40%/);
});

test("renderStats doesn't crash on a missing user", () => {
  assert.match(renderStats(undefined), /streak-num">0</);
});

test("renderGreeting escapes the name", () => {
  assert.match(renderGreeting({ name: "<Alex>" }), /&lt;Alex&gt;/);
});

test("joinReminders attaches contacts and tolerates unknown ids", () => {
  const joined = joinReminders([{ contact_id: "c1" }, { contact_id: "zzz" }], contacts);
  assert.equal(joined[0].contact.name, "Sarah");
  assert.equal(joined[1].contact, null);
  assert.deepEqual(joinReminders(undefined, contacts), []);
});

test("renderCoachCards renders every field and escapes LLM text", () => {
  const html = renderCoachCards([{
    contact_id: "c1", headline: "Grant <done>", reason: "R", suggested_action: "A", tip: "T",
  }], contacts);
  assert.match(html, /Sarah/);
  assert.match(html, /Research scientist · BYU/);
  assert.match(html, /Grant &lt;done&gt;/);
  assert.match(html, /data-coach-index="0"/);
  assert.match(html, /💡 T/);
});

test("renderCoachCards leaves out optional fields that are missing", () => {
  const html = renderCoachCards([{ contact_id: "c1", headline: "Hi" }], contacts);
  assert.doesNotMatch(html, /coach-tip/);
  assert.doesNotMatch(html, /coach-action/);
});

test("renderCoachCards shows an empty state", () => {
  assert.match(renderCoachCards([], contacts), /No suggestions/);
});

test("renderCoachError offers a retry", () => {
  assert.match(renderCoachError("boom"), /data-action="refresh-coach"/);
});

test("renderTasks links open tasks to the task screen and hides done ones", () => {
  const html = renderTasks([
    { id: "t1", title: "Attend the Qualtrics info session", type: "in_person", xp: 75, status: "open" },
    { id: "t2", title: "Old", xp: 50, status: "done" },
  ]);
  assert.match(html, /href="#\/task\/t1"/);
  assert.match(html, /\+75 XP/);
  assert.doesNotMatch(html, /Old/);
  assert.match(renderTasks([]), /All tasks done/);
});

test("renderGamePicker links all four games to the game screen", () => {
  const html = renderGamePicker();
  for (const g of GAMES) assert.match(html, new RegExp(`href="#/game/${g.id}"`));
});

test("GAMES matches the backend game configs", () => {
  for (const g of GAMES) {
    assert.ok(MOCK_GAMES[g.id], `unknown game ${g.id}`);
    assert.equal(g.xp, MOCK_GAMES[g.id].xp, `${g.id} XP`);
    assert.equal(g.title, MOCK_GAMES[g.id].title, `${g.id} title`);
  }
});

test("renderHome works from seed state", () => {
  const html = renderHome(normalizeState(SEED));
  assert.match(html, /Hi, Alex!/);
  assert.match(html, /id="coach-cards"/);
  assert.match(html, /Qualtrics/);
});

test("normalizeDraft accepts several response shapes", () => {
  assert.equal(normalizeDraft("hi"), "hi");
  assert.equal(normalizeDraft({ message: "a" }), "a");
  assert.equal(normalizeDraft({ draft: "b" }), "b");
  assert.equal(normalizeDraft({ text: "c" }), "c");
  assert.equal(normalizeDraft(null), "");
});

test("renderDraftSheet escapes the draft inside the textarea", () => {
  const html = renderDraftSheet({ contact: { name: "Sarah" }, reason: "R" }, "</textarea><b>x");
  assert.match(html, /Message to Sarah/);
  assert.match(html, /&lt;\/textarea&gt;/);
  assert.match(html, /data-action="copy-draft"/);
});

test("loadReminders caches until forced", async () => {
  const first = await loadReminders();
  assert.equal(first[0].contact_id, "c1");
  // A task completion adds Marcus; the cache shouldn't change until a refresh.
  const { post } = await import("../../frontend/app.js");
  await post("/api/tasks/t1/complete", { met_name: "Marcus", role: "Data engineer", company: "Qualtrics", hook: "Team moving to dbt" });
  assert.equal((await loadReminders()).length, 1);
  const fresh = await loadReminders({ force: true });
  assert.match(fresh[0].headline, /dbt/);
});
