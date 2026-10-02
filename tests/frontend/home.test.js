import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  xpProgress, renderStats, renderGreeting, joinReminders, renderCoachCards,
  renderCoachError, renderTasks, renderGamePicker, renderHome, normalizeDraft,
  renderDraftSheet, loadReminders, _resetCoachCache,
  renderTaskCard, renderDailyGoal,
} from "../../frontend/home.js";
import { GAMES } from "../../frontend/game.js";
import { openTasks, taskMeta, difficultyLabel } from "../../frontend/tasks.js";
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

test("openTasks puts real-world tasks first, then higher XP", () => {
  const order = openTasks(SEED.tasks).map((t) => t.id);
  assert.deepEqual(order, ["t1", "t5", "t2", "t4", "t3", "t6"]);
  assert.deepEqual(openTasks([{ id: "a", type: "mystery", xp: 5 }, { id: "b", type: "call", xp: 1 }]).map((t) => t.id), ["b", "a"]);
  assert.deepEqual(openTasks([{ id: "x", status: "complete" }]), []);
});

test("renderTaskCard shows type, difficulty, description, location, and XP", () => {
  const html = renderTaskCard(SEED.tasks.find((t) => t.id === "t5"));
  assert.match(html, /href="#\/task\/t5"/);
  assert.match(html, /📍/);
  assert.match(html, /Nearby event · Hard/);
  assert.match(html, /hack night/);
  assert.match(html, /Nearby event · AI search later/);
  assert.match(html, /\+100 XP/);
});

test("renderTaskCard copes with a bare task", () => {
  const html = renderTaskCard({ id: "z", title: "<b>Do it</b>" });
  assert.match(html, /Connection · Medium/);
  assert.match(html, /&lt;b&gt;Do it/);
  assert.doesNotMatch(html, /task-desc|task-where/);
  assert.equal(taskMeta(undefined).label, "Connection");
  assert.equal(difficultyLabel({ difficulty: "easy" }), "Easy");
});

test("renderTasks highlights the best next move and shows the daily goal", () => {
  const html = renderTasks(SEED.tasks, SEED.user);
  assert.match(html, /Best next move/);
  assert.match(html, /<div class="next-task">[\s\S]*Qualtrics[\s\S]*<\/div>/);
  assert.match(html, /0<\/strong>\/1|0\/1/);
  assert.match(renderTasks(SEED.tasks, { ...SEED.user, today_connection_done: true }), /daily-goal done/);
});

test("renderDailyGoal reflects today_connection_done", () => {
  assert.match(renderDailyGoal({ today_connection_done: false }), /0\/1/);
  assert.match(renderDailyGoal({ today_connection_done: true }), /1\/1/);
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

test("renderHome only shows the debug panel when asked", () => {
  const state = normalizeState(SEED);
  assert.doesNotMatch(renderHome(state), /debug-panel/);
  const html = renderHome(state, { debug: true });
  assert.match(html, /debug-panel/);
  assert.match(html, /data-debug-xp="10"/);
  assert.match(html, /data-debug-streak="1"/);
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
