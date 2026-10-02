// radar.js — everything saved with "Save to Radar": events by date, then people and
// communities. Reads saved copies from GET /api/radar, so it never runs a new search.
// Render functions are pure (data -> HTML) so they're unit-tested.

import { registerScreen, api, esc, toast, todayISO } from "./app_b.js";
import { eventToICS, opportunityDate } from "./home_b.js";

// An event is past once its start date is before today.
export function isPast(item, today = todayISO()) {
  return Boolean(item?.starts_at) && String(item.starts_at).slice(0, 10) < today;
}

export function renderRadarItem(item, today) {
  const event = item.kind === "event";
  const past = event && isPast(item, today);
  const ics = event && item.starts_at ? eventToICS(item) : "";
  return `
    <article class="card research-card radar-item${past ? " radar-item--past" : ""}" data-radar-id="${esc(item.id)}">
      <div class="research-card-head">
        <span class="eyebrow">${event ? (past ? "Past event" : "Upcoming event") : "People to explore"}</span>
        <span class="radar-badge">On Radar</span>
      </div>
      <h3>${esc(item.title)}</h3>
      ${item.starts_at ? `<p class="research-date">📅 ${esc(opportunityDate(item))}</p>` : ""}
      ${item.location ? `<p class="research-location">📍 ${esc(item.location)}</p>` : ""}
      ${item.summary ? `<p>${esc(item.summary)}</p>` : ""}
      ${item.source_url ? `<small class="research-source">Source: <a href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(item.source_name || "link")}</a></small>` : ""}
      <div class="research-actions">
        <a class="btn btn-small" href="${esc(item.action_url)}" target="_blank" rel="noopener">${event ? "Details / RSVP" : "Explore people"}</a>
        ${ics && !past ? `<a class="btn btn-small btn-ghost" href="data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}" download="${esc(item.id)}.ics">Add to calendar</a>` : ""}
        <button class="btn btn-small btn-ghost" data-action="remove-radar" data-opportunity-id="${esc(item.id)}">Remove from Radar</button>
      </div>
    </article>`;
}

export function renderRadar(response, today) {
  const items = Array.isArray(response?.items) ? response.items : [];
  const events = items.filter((i) => i.kind === "event");
  const people = items.filter((i) => i.kind !== "event");
  const head = `<div class="block-head"><h1>Radar</h1></div>`;
  if (!items.length) {
    return `${head}
      <div class="empty">Nothing on your Radar yet. Tap <strong>Save to Radar</strong> on an event in Research for you on Home.</div>`;
  }
  return `${head}
    ${events.length ? `<section class="block radar-group"><h2>Events</h2>${events.map((i) => renderRadarItem(i, today)).join("")}</section>` : ""}
    ${people.length ? `<section class="block radar-group"><h2>People &amp; communities</h2>${people.map((i) => renderRadarItem(i, today)).join("")}</section>` : ""}`;
}

async function load(el) {
  el.innerHTML = `<div class="block-head"><h1>Radar</h1></div><div class="card skeleton"></div>`;
  try {
    const response = await api("/api/radar");
    el.innerHTML = renderRadar(response, response?.today);
  } catch (err) {
    el.innerHTML = `<div class="block-head"><h1>Radar</h1></div>
      <div class="error-box">Your Radar couldn't load (${esc(err.message)}). <button class="btn btn-small btn-ghost" data-action="reload-radar">Try again</button></div>`;
  }
}

registerScreen("radar", {
  async show({ el }) {
    el.onclick = (e) => {
      if (e.target.closest("[data-action=reload-radar]")) return load(el);
      const remove = e.target.closest("[data-action=remove-radar]");
      if (!remove) return;
      remove.disabled = true;
      api(`/api/opportunities/${encodeURIComponent(remove.dataset.opportunityId)}/radar`, { method: "DELETE" })
        .then(() => load(el))
        .then(() => toast("Removed from your Radar"))
        .catch((err) => { remove.disabled = false; toast(`Couldn't update Radar: ${err.message}`); });
    };
    await load(el);
  },
});
