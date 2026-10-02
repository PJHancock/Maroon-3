import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GAMES, findGame, buildGameContext, contextLabel, normalizeStart, replyFrom, turnLabel,
  renderMessages, renderChat, renderScore, renderGameError,
} from "../../frontend/game.js";
import { normalizeState } from "../../frontend/app.js";
import { SEED, MOCK_GAMES } from "../../frontend/mock.js";

const state = normalizeState(SEED);

test("GAMES matches backend/games.py (via the mock)", () => {
  assert.deepEqual(GAMES.map((g) => g.id).sort(), Object.keys(MOCK_GAMES).sort());
  for (const g of GAMES) {
    assert.equal(g.title, MOCK_GAMES[g.id].title, `${g.id} title`);
    assert.equal(g.xp, MOCK_GAMES[g.id].xp, `${g.id} xp`);
    assert.equal(g.maxTurns, MOCK_GAMES[g.id].max_turns, `${g.id} turns`);
  }
});

test("findGame looks up by id", () => {
  assert.equal(findGame("coffee_chat").title, "Coffee Chat");
  assert.equal(findGame("nope"), null);
});

test("buildGameContext keeps only what the persona needs", () => {
  const ctx = buildGameContext(state);
  assert.deepEqual(ctx.user, { name: "Alex", school: "BYU", major: "Computer Science", target_roles: ["Data Engineer"] });
  assert.equal(ctx.user.xp, undefined, "no XP or streak");
  assert.equal(ctx.contacts.length, 3);
  assert.deepEqual(Object.keys(ctx.contacts[0]).sort(), ["company", "id", "last_contact", "name", "notes", "role"]);
  assert.equal(ctx.contacts[0].how_met, undefined, "how_met isn't shared");
  assert.equal(ctx.open_tasks.length, 6);
  assert.deepEqual(ctx.recent_game_sessions[0].scores, { curiosity: 4, specificity: 2, rapport: 3 });
});

test("buildGameContext caps list sizes and skips finished tasks", () => {
  const many = { ...state, contacts: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, notes: ["a", "b", "c", "d", "e"] })),
    tasks: [{ id: "t1", status: "complete" }, { id: "t2", status: "open" }] };
  const ctx = buildGameContext(many);
  assert.equal(ctx.contacts.length, 8);
  assert.equal(ctx.contacts[0].notes.length, 4);
  assert.deepEqual(ctx.open_tasks.map((t) => t.id), ["t2"]);
});

test("buildGameContext survives no state", () => {
  const ctx = buildGameContext(null);
  assert.deepEqual(ctx.contacts, []);
  assert.equal(ctx.user.name, "");
});

test("contextLabel", () => {
  assert.equal(contextLabel(buildGameContext(state)), "Personalized for Alex · 3 remembered connections");
  assert.equal(contextLabel({ user: { name: "A" }, contacts: [{}] }), "Personalized for A · 1 remembered connection");
  assert.equal(contextLabel({ user: { name: "A" }, contacts: [] }), "Personalized for A");
  assert.equal(contextLabel({}), "Personalized using your networking context");
});

test("normalizeStart reads opening_line and falls back to the game config", () => {
  const game = findGame("coffee_chat");
  assert.deepEqual(normalizeStart({ title: "T", goal: "G", opening_line: "Hi", max_turns: 2 }, game),
    { title: "T", goal: "G", maxTurns: 2, opening: "Hi" });
  const fallback = normalizeStart({}, game);
  assert.equal(fallback.title, "Coffee Chat");
  assert.equal(fallback.maxTurns, 4);
  assert.equal(fallback.opening, "");
  assert.equal(normalizeStart({ opening: "Old shape" }, game).opening, "Old shape");
});

test("replyFrom accepts several shapes", () => {
  assert.equal(replyFrom({ reply: "a" }), "a");
  assert.equal(replyFrom({ message: "b" }), "b");
  assert.equal(replyFrom(null), "");
});

test("turnLabel", () => {
  assert.equal(turnLabel(0, 1), "One response");
  assert.equal(turnLabel(2, 4), "Turn 2 of 4");
});

test("renderMessages labels each side and escapes text", () => {
  const html = renderMessages([{ role: "assistant", content: "Hi <b>" }, { role: "user", content: "Hello" }]);
  assert.match(html, /chat-msg--them[\s\S]*Them[\s\S]*Hi &lt;b&gt;/);
  assert.match(html, /chat-msg--you[\s\S]*You[\s\S]*Hello/);
  assert.match(renderMessages([]), /Your conversation will appear here/);
});

test("renderChat: multi-turn has Send + Finish and a turn counter", () => {
  const html = renderChat({ title: "Coffee Chat", goal: "Learn", maxTurns: 4, turn: 1, history: [], context: buildGameContext(state) });
  assert.match(html, /Turn 1 of 4/);
  assert.match(html, /data-send>Send</);
  assert.match(html, /data-finish/);
  assert.match(html, /Personalized for Alex/);
});

test("renderChat: single-turn goes straight to feedback", () => {
  const html = renderChat({ title: "Elevator Pitch", goal: "", maxTurns: 1, turn: 0, history: [], context: {} });
  assert.match(html, /One response/);
  assert.match(html, /data-send>Get feedback</);
  assert.doesNotMatch(html, /data-finish/);
});

test("renderScore shows bars, feedback, next question, XP, and actions", () => {
  const html = renderScore({
    scores: { value_to_them: 4, clarity: 9 }, best_moment: "B", one_fix: "F", rewrite_example: "R",
    recommended_follow_up: "Ask <Sarah>", xp: 15,
  }, findGame("coffee_chat"));
  assert.match(html, /value to them/);
  assert.match(html, /4\/5/);
  assert.match(html, /width:80%/);
  assert.match(html, /5\/5/, "scores are clamped to 5");
  assert.match(html, /\+15 XP/);
  assert.match(html, /Ask &lt;Sarah&gt;/);
  assert.match(html, /data-action="retry"/);
  assert.match(html, /data-action="home"/);
});

test("renderScore fills in missing feedback and uses the game's XP", () => {
  const html = renderScore({}, findGame("cold_call"));
  assert.match(html, /\+20 XP/);
  assert.match(html, /No rubric scores came back/);
  assert.doesNotMatch(html, /feedback--next/);
});

test("renderGameError offers retry and home", () => {
  const html = renderGameError("Boom <x>");
  assert.match(html, /Boom &lt;x&gt;/);
  assert.match(html, /data-action="retry"/);
});
