import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isPast, renderRadarItem, renderRadar } from "../../frontend/radar.js";
import { parseRoute, setMockMode, api } from "../../frontend/app_b.js";
import { resetMock, setMockDelay } from "../../frontend/mock_b.js";
import { eventToICS, opportunityDate } from "../../frontend/home_b.js";

const TODAY = "2026-10-02";
const event = {
  id: "r1", kind: "event", title: "Utah Data Engineering Meetup", summary: "Monthly talks.",
  why_it_fits: "Fits.", source_name: "Meetup", source_url: "https://meetup.com/x",
  action_url: "https://meetup.com/x/rsvp", starts_at: "2026-10-21T18:30:00-06:00",
  location: "Lehi, UT", tags: [], saved_at: TODAY,
};
const person = { ...event, id: "r2", kind: "person", title: "BYU Data Science Club", starts_at: null, action_url: "https://linkedin.com/c" };

beforeEach(() => {
  setMockMode(true);
  setMockDelay(0);
  resetMock();
});

test("the router knows the radar screen", () => {
  assert.deepEqual(parseRoute("#/radar"), { name: "radar", id: null });
});

test("isPast compares the event's date to today", () => {
  assert.equal(isPast(event, TODAY), false);
  assert.equal(isPast({ starts_at: "2026-10-01T09:00:00-06:00" }, TODAY), true);
  assert.equal(isPast({ starts_at: TODAY }, TODAY), false, "today isn't past");
  assert.equal(isPast(person, TODAY), false);
});

test("an upcoming event has RSVP, calendar, remove, and the On Radar pill", () => {
  const html = renderRadarItem(event, TODAY);
  assert.match(html, /Upcoming event/);
  assert.match(html, /<span class="radar-badge">On Radar<\/span>/);
  assert.match(html, /href="https:\/\/meetup.com\/x\/rsvp"[^>]*>Details \/ RSVP</);
  assert.match(html, /download="r1.ics">Add to calendar/);
  assert.match(html, /data-action="remove-radar" data-opportunity-id="r1">Remove from Radar/);
  assert.match(html, /Lehi, UT/);
});

test("a past event is labeled and loses the calendar button", () => {
  const html = renderRadarItem({ ...event, starts_at: "2026-09-17T10:00:00-06:00" }, TODAY);
  assert.match(html, /Past event/);
  assert.match(html, /radar-item--past/);
  assert.doesNotMatch(html, /Add to calendar/);
});

test("people paths link out and have no calendar button", () => {
  const html = renderRadarItem(person, TODAY);
  assert.match(html, /People to explore/);
  assert.match(html, />Explore people</);
  assert.doesNotMatch(html, /Add to calendar|research-date/);
});

test("renderRadar groups events and people, and escapes text", () => {
  const html = renderRadar({ items: [event, person, { ...event, id: "r3", title: "<b>x</b>" }], unavailable: 0 }, TODAY);
  assert.match(html, /<h1>Radar<\/h1>/);
  assert.ok(html.indexOf("<h2>Events</h2>") < html.indexOf("<h2>People &amp; communities</h2>"));
  assert.match(html, /&lt;b&gt;x/);
});

test("renderRadar explains an empty radar and never mentions older saves", () => {
  assert.match(renderRadar({ items: [] }, TODAY), /Nothing on your Radar yet/);
  assert.match(renderRadar({ items: [], unavailable: 2 }, TODAY), /Nothing on your Radar yet/);
  assert.doesNotMatch(renderRadar({ items: [event], unavailable: 1 }, TODAY), /older save|can't be shown/);
  assert.match(renderRadar(null, TODAY), /Nothing on your Radar yet/);
});

test("date-only events show the right day with no made-up time", () => {
  const label = opportunityDate({ starts_at: "2026-11-09" });
  assert.match(label, /9/);
  assert.doesNotMatch(label, /\b8\b|AM|PM/, `got "${label}"`);
  assert.match(opportunityDate({ starts_at: "2026-10-21T18:30:00-06:00" }), /AM|PM/, "timed events keep their time");
});

test("date-only events export as all-day calendar entries", () => {
  const ics = eventToICS({ ...event, starts_at: "2026-11-09", ends_at: null });
  assert.match(ics, /DTSTART;VALUE=DATE:20261109/);
  assert.match(ics, /DTEND;VALUE=DATE:20261110/);
  const multi = eventToICS({ ...event, starts_at: "2026-11-09", ends_at: "2026-11-12" });
  assert.match(multi, /DTEND;VALUE=DATE:20261113/, "end is exclusive");
  const monthEnd = eventToICS({ ...event, starts_at: "2026-10-31", ends_at: null });
  assert.match(monthEnd, /DTEND;VALUE=DATE:20261101/);
  assert.match(eventToICS(event), /DTSTART:20261022T003000Z/, "timed events stay in UTC");
});

test("mock: saving to radar shows up in GET /api/radar and removing takes it off", async () => {
  const { opportunities } = await api("/api/opportunities");
  const target = opportunities[0];
  assert.deepEqual((await api("/api/radar")).items, []);
  await api(`/api/opportunities/${target.id}/radar`, { method: "POST" });
  const radar = await api("/api/radar");
  assert.equal(radar.items.length, 1);
  assert.equal(radar.items[0].title, target.title);
  assert.equal(radar.items[0].on_radar, undefined);
  await api(`/api/opportunities/${target.id}/radar`, { method: "DELETE" });
  assert.deepEqual((await api("/api/radar")).items, []);
});
