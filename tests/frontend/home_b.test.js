import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  GAMES, xpProgress, renderStats, renderGreeting, joinReminders, renderCoachCards,
  renderCoachError, renderTasks, renderGamePicker, renderHome, normalizeDraft,
  renderDraftSheet, renderSuggestionSheet, renderProposedTasks, loadReminders, _resetCoachCache, eventToICS, renderResearchPanel,
} from "../../frontend/home_b.js";
import { setMockMode, normalizeState } from "../../frontend/app_b.js";
import { SEED, resetMock, setMockDelay, MOCK_GAMES } from "../../frontend/mock_b.js";
import { renderTaskPrep, renderReflectionForm, linkedinSearchUrl, eventToICS as taskEventToICS } from "../../frontend/tasks_C.js";

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
  assert.match(html, /No extra details/);
});

test("reminders start collapsed: title and contact in the summary, details hidden", () => {
  const html = renderCoachCards([{
    contact_id: "c1", headline: "Ask Sarah about the grant", reason: "Deadline passed", suggested_action: "Ask how it went", tip: "Be specific",
  }], contacts, "2026-10-02");
  const [summary, details] = html.split('<div class="coach-details"');
  assert.match(summary, /Ask Sarah about the grant/);
  assert.match(summary, /Sarah/);
  assert.match(summary, /Research scientist · BYU/);
  assert.match(summary, /Met: Mom&#39;s friend · Talked 22 days ago/);
  assert.match(summary, /data-action="toggle-reminder" aria-expanded="false"/);
  assert.doesNotMatch(summary, /Deadline passed|Ask how it went|Be specific/, "details aren't in the summary");
  assert.match(details, /^ id="reminder-details-0" hidden>/);
  assert.match(details, /Deadline passed/);
  assert.match(details, /Get conversation ideas/);
});

test("reminder meta line drops parts the contact doesn't have", () => {
  const html = renderCoachCards([{ contact_id: "x", headline: "Hi" }], [{ id: "x", name: "Z" }], "2026-10-02");
  assert.doesNotMatch(html, /coach-meta/);
  const unknown = renderCoachCards([{ contact_id: "missing", headline: "Hi" }], contacts, "2026-10-02");
  assert.match(unknown, /A contact/);
});

test("renderCoachCards shows an empty state", () => {
  assert.match(renderCoachCards([], contacts), /No reminders right now/);
});

test("the home section is titled Reminders", () => {
  assert.match(renderHome(normalizeState(SEED)), /<h2>Reminders<\/h2>/);
  assert.doesNotMatch(renderHome(normalizeState(SEED)), /Your coach/);
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

test("task prep puts guidance before the interaction report", () => {
  const task = { id: "t1", title: "Attend a data event", type: "event", difficulty: "hard", xp: 100 };
  const html = renderTaskPrep(task, SEED.contacts, [], { user: SEED.user });
  assert.match(html, /Before you report it/);
  assert.match(html, /Make it happen/);
  assert.match(html, /I did it — report connection/);
  assert.doesNotMatch(html, /Connection note \*/);
});

test("task prep exposes contact actions and personalized LinkedIn route", () => {
  const task = { id: "t4", title: "Call someone", type: "call", difficulty: "medium", xp: 45 };
  const contact = { ...SEED.contacts[0], phone: "(801) 555-0123", email: "sarah@example.com" };
  const html = renderTaskPrep(task, [contact], [], { user: SEED.user, selectedContactId: contact.id });
  assert.match(html, /tel:8015550123/);
  assert.match(html, /mailto:sarah@example.com/);
  assert.match(linkedinSearchUrl(SEED.user), /linkedin\.com\/search\/results\/people/);
});

test("task prep attaches opportunity context and report displays it", () => {
  const task = { id: "t5", title: "Attend an event", type: "event", xp: 100, prep_context: {
    opportunity_id: "r1", kind: "event", title: "Data meetup", summary: "Meet people", why_it_fits: "Relevant",
    source_name: "Meetup", source_url: "https://example.com/source", action_url: "https://example.com/event",
    starts_at: "2026-10-17T09:00:00-06:00", location: "Provo, UT",
  } };
  const html = renderTaskPrep(task, SEED.contacts, [task.prep_context], { researchLoaded: true, user: SEED.user });
  assert.match(html, /Attached context/);
  assert.match(renderReflectionForm(task, SEED.contacts), /Prepared with/);
  assert.match(taskEventToICS(task.prep_context), /BEGIN:VCALENDAR/);
});

test("selected person is carried into the interaction report fields", () => {
  const task = { id: "t4", title: "Call someone", type: "call", xp: 45 };
  const contact = { id: "c9", name: "Taylor", role: "Data engineer", company: "Example Co" };
  const html = renderReflectionForm(task, [contact], contact.id);
  assert.match(html, /name="met_name"[^>]*value="Taylor"/);
  assert.match(html, /name="role"[^>]*value="Data engineer"/);
  assert.match(html, /name="company"[^>]*value="Example Co"/);
  assert.match(html, /<option value="c9" selected>Taylor/);
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

test("renderSuggestionSheet escapes LLM suggestions", () => {
  const html = renderSuggestionSheet({ contact: { name: "Sarah" }, reason: "R" }, ["<script>bad</script>"]);
  assert.match(html, /Suggestions for Sarah/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /data-action="reached-out"/);
});

test("renderProposedTasks includes XP, frequency, and actions", () => {
  const html = renderProposedTasks([{ id: "p1", title: "Attend a meetup", type: "event", xp: 80, skill: "events", frequency: "weekly" }]);
  assert.match(html, /Attend a meetup/);
  assert.match(html, /\+80 XP/);
  assert.match(html, /value="weekly" selected/);
  assert.match(html, /data-action="accept-task"/);
  assert.match(html, /data-action="reject-task"/);
});

test("research events can be downloaded as calendar files", () => {
  const ics = eventToICS({
    id: "r1", title: "Data meetup", summary: "Meet data engineers", why_it_fits: "Matches your goal",
    action_url: "https://example.com/event", starts_at: "2026-10-17T09:00:00-06:00",
    ends_at: "2026-10-17T10:00:00-06:00", location: "Provo, UT",
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Data meetup/);
  assert.match(ics, /LOCATION:Provo\\, UT/);
});

test("research panel distinguishes live results from demo mode", () => {
  assert.match(renderResearchPanel({ source: "demo", opportunities: [] }), /Turn on live mode/);
  const html = renderResearchPanel({
    source: "live", profile_summary: "Matched to data engineering", searched_at: "2026-10-02", window_ends: "2026-12-31",
    opportunities: [{ id: "r1", kind: "person", title: "Public data community", summary: "A public path", why_it_fits: "Relevant", source_name: "Community", source_url: "https://example.com/source", action_url: "https://example.com/action", on_radar: false }],
  });
  assert.match(html, /Public data community/);
  assert.match(html, /Save to Radar/);
});

test("loadReminders caches until forced", async () => {
  const first = await loadReminders();
  assert.equal(first[0].contact_id, "c1");
  // A task completion adds Marcus; the cache shouldn't change until a refresh.
  const { post } = await import("../../frontend/app_b.js");
  await post("/api/tasks/t1/complete", { met_name: "Marcus", role: "Data engineer", company: "Qualtrics", hook: "Team moving to dbt" });
  assert.equal((await loadReminders()).length, 1);
  const fresh = await loadReminders({ force: true });
  assert.match(fresh[0].headline, /dbt/);
});
