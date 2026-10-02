// home_b.js — streak, XP, coach cards, draft sheet, task list, game picker.
// Owner: Teammate B. Render functions are pure (data -> HTML) so they're unit-tested.

import {
  registerScreen, getState, refreshState, post, api, esc,
  openSheet, closeSheet, copyText, toast,
  isDebugMode, applyDebugXp, showCelebration, _setState,
} from "./app_b.js";
import { lastContactLabel } from "./contacts_b.js";

// Mirrors GAME_CONFIGS in backend/games.py (title + XP only).
export const GAMES = [
  { id: "elevator_pitch", title: "Elevator Pitch", xp: 10, icon: "🎤", blurb: "30 seconds to make an impression" },
  { id: "coffee_chat", title: "Coffee Chat", xp: 15, icon: "☕", blurb: "Learn about their work" },
  { id: "follow_up", title: "Follow-Up", xp: 10, icon: "✉️", blurb: "Give them a reason to reply" },
  { id: "cold_call", title: "Cold Outreach", xp: 20, icon: "📞", blurb: "Earn a reply from a stranger" },
];

export const XP_PER_LEVEL = 100;

export function xpProgress(xp, perLevel = XP_PER_LEVEL) {
  const total = Math.max(0, Number(xp) || 0);
  return {
    level: Math.floor(total / perLevel) + 1,
    into: total % perLevel,
    perLevel,
    pct: Math.round(((total % perLevel) / perLevel) * 100),
  };
}

// ---------- pure renderers ----------

export function renderStats(user) {
  const p = xpProgress(user?.xp);
  return `
    <div class="stats">
      <div class="streak" title="Day streak">
        <span class="flame">🔥</span><span class="streak-num">${Number(user?.streak) || 0}</span>
      </div>
      <div class="xp">
        <div class="xp-label"><span>Level ${p.level}</span><span>${Number(user?.xp) || 0} XP</span></div>
        <div class="xp-bar" role="progressbar" aria-valuenow="${p.into}" aria-valuemax="${p.perLevel}">
          <div class="xp-fill" style="width:${p.pct}%"></div>
        </div>
      </div>
    </div>`;
}

export function renderGreeting(user) {
  return `<h1 class="greeting">Hi, ${esc(user?.name ?? "there")}!</h1>`;
}

// Join reminders to contacts by contact_id; drop nothing, fall back on names.
export function joinReminders(reminders, contacts) {
  const byId = Object.fromEntries((contacts ?? []).map((c) => [c.id, c]));
  return (Array.isArray(reminders) ? reminders : []).map((r) => ({
    ...r,
    contact: byId[r.contact_id] ?? null,
  }));
}

// Reminder cards start collapsed (title + who it's about); tapping the summary
// expands the reason, suggested action, tip, and the conversation-ideas button.
export function renderCoachCards(reminders, contacts, today) {
  const cards = joinReminders(reminders, contacts);
  if (!cards.length) {
    return `<div class="empty">No reminders right now. Complete a task to meet someone new!</div>`;
  }
  return cards.map((r, i) => {
    const name = r.contact?.name ?? "A contact";
    const sub = [r.contact?.role, r.contact?.company].filter(Boolean).join(" · ");
    const meta = [
      r.contact?.how_met ? `Met: ${r.contact.how_met}` : "",
      lastContactLabel(r.contact?.last_contact, today),
    ].filter(Boolean).join(" · ");
    const hasDetails = r.reason || r.suggested_action || r.tip;
    return `
      <article class="card coach-card" data-coach-card="${i}">
        <button class="coach-summary" data-action="toggle-reminder" aria-expanded="false" aria-controls="reminder-details-${i}">
          <span class="coach-who"><span class="avatar">${esc(name[0] ?? "?")}</span>
            <span class="coach-who-text"><strong>${esc(name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}${meta ? `<small class="coach-meta">${esc(meta)}</small>` : ""}</span>
            <span class="coach-chevron" aria-hidden="true">▾</span></span>
          <span class="coach-headline">${esc(r.headline ?? "Worth reaching out")}</span>
        </button>
        <div class="coach-details" id="reminder-details-${i}" hidden>
          ${r.reason ? `<p class="coach-reason">${esc(r.reason)}</p>` : ""}
          ${r.suggested_action ? `<p class="coach-action">👉 ${esc(r.suggested_action)}</p>` : ""}
          ${r.tip ? `<p class="coach-tip">💡 ${esc(r.tip)}</p>` : ""}
          ${hasDetails ? "" : `<p class="muted">No extra details for this reminder.</p>`}
          <button class="btn btn-small" data-coach-index="${i}">Get conversation ideas</button>
        </div>
      </article>`;
  }).join("");
}

export function renderProposedTasks(proposedTasks) {
  const tasks = Array.isArray(proposedTasks) ? proposedTasks : [];
  if (!tasks.length) return "";
  return `<section class="block">
    <div class="block-head"><h2>Suggested for you</h2><button class="btn btn-small btn-ghost" data-action="refresh-proposals">↻ New ideas</button></div>
    <p class="muted">The coach proposed these connection activities. Accept the ones that fit your day.</p>
    ${tasks.map((task) => {
      const meta = TASK_PRIORITY[task.type] ?? { label: "Connection", icon: "✅" };
      return `<div class="card proposal-card" data-proposal-id="${esc(task.id)}">
        <div class="proposal-header"><span class="task-icon">${meta.icon}</span><span class="task-title"><strong>${esc(task.title)}</strong>${task.description ? `<em>${esc(task.description)}</em>` : ""}${task.skill ? `<span class="skill-badge">${esc(task.skill)}</span>` : ""}</span><span class="xp-pill">+${Number(task.xp) || 0} XP</span></div>
        <div class="proposal-actions"><select class="frequency-select" data-frequency-for="${esc(task.id)}"><option value="once">One-time</option><option value="daily">Daily</option><option value="weekly"${task.frequency === "weekly" ? " selected" : ""}>Weekly</option></select><button class="btn btn-small" data-action="accept-task" data-task-id="${esc(task.id)}">Accept</button><button class="btn btn-small btn-ghost" data-action="reject-task" data-task-id="${esc(task.id)}">Skip</button></div>
      </div>`;
    }).join("")}</section>`;
}

export function renderCoachLoading() {
  return `<div class="card skeleton"></div><div class="card skeleton"></div>`;
}

export function renderCoachError(message) {
  return `<div class="error-box">The coach couldn't load (${esc(message)}).
    <button class="btn btn-small" data-action="refresh-coach">Try again</button></div>`;
}

const TASK_PRIORITY = {
  in_person: { label: "In person", icon: "🤝", priority: 0, realWorld: true },
  event: { label: "Nearby event", icon: "📍", priority: 1, realWorld: true },
  personal_chat: { label: "Personal chat", icon: "☕", priority: 2, realWorld: true },
  call: { label: "Make a call", icon: "📞", priority: 3 },
  online_outreach: { label: "Reach out online", icon: "💬", priority: 4 },
  follow_up: { label: "Follow up", icon: "✉️", priority: 5 },
};

export function renderTasks(tasks) {
  const open = (Array.isArray(tasks) ? tasks : [])
    .filter((t) => (t.status ?? "open") === "open")
    .sort((a, b) => (TASK_PRIORITY[a.type]?.priority ?? 6) - (TASK_PRIORITY[b.type]?.priority ?? 6)
      || (Number(b.xp) || 0) - (Number(a.xp) || 0));
  if (!open.length) return `<div class="empty">All tasks done. Your connection habit is strong!</div>`;
  return open.map((t) => {
    const meta = TASK_PRIORITY[t.type] ?? { label: "Connection", icon: "✅", priority: 6 };
    const realWorld = Boolean(meta.realWorld);
    const difficulty = String(t.difficulty ?? "medium").replace(/^./, (c) => c.toUpperCase());
    return `
      <a class="card task-card ${realWorld ? "task-card--priority" : ""}" href="#/task/${encodeURIComponent(t.id)}">
        <span class="task-icon">${meta.icon}</span>
        <span class="task-title"><small>${esc(meta.label)} · ${esc(difficulty)}</small><strong>${esc(t.title)}</strong>${t.description ? `<em>${esc(t.description)}</em>` : ""}${t.location ? `<em>${esc(t.location)}</em>` : ""}<em>Prepare →</em></span>
        <span class="xp-pill">+${Number(t.xp) || 0} XP</span>
      </a>`;
  }).join("");
}

export function renderGamePicker(games = GAMES) {
  return `<div class="game-grid">${games.map((g) => `
    <a class="game-tile" href="#/game/${encodeURIComponent(g.id)}">
      <span class="game-icon">${g.icon}</span>
      <strong>${esc(g.title)}</strong>
      <small>${esc(g.blurb)}</small>
      <span class="xp-pill">+${g.xp} XP</span>
    </a>`).join("")}</div>`;
}

export function renderSuggestionSheet(reminder, suggestions) {
  const name = reminder?.contact?.name ?? "your contact";
  return `<h2>Suggestions for ${esc(name)}</h2>${reminder?.reason ? `<p class="muted">${esc(reminder.reason)}</p>` : ""}<p>You could ask about:</p><ul class="suggestion-list">${(Array.isArray(suggestions) ? suggestions : []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul><div class="sheet-actions"><button class="btn" data-action="reached-out">I reached out ✓</button><button class="btn btn-ghost" data-action="close-sheet">Close</button></div>`;
}

// "2026-11-09" (no time) means a whole day. new Date() would read it as UTC
// midnight, which shows as the previous afternoon in US time zones.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function localDate(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function opportunityDate(item) {
  if (!item?.starts_at) return "";
  if (DATE_ONLY.test(item.starts_at)) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(localDate(item.starts_at));
  }
  const date = new Date(item.starts_at);
  if (Number.isNaN(date.getTime())) return String(item.starts_at).slice(0, 10);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function eventToICS(item) {
  if (!item?.starts_at) return "";
  const toICSDate = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  };
  let dates;
  if (DATE_ONLY.test(item.starts_at)) {
    // All-day event: DTEND is the (exclusive) day after the last day.
    const day = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const first = localDate(item.starts_at);
    const last = DATE_ONLY.test(item.ends_at ?? "") ? localDate(item.ends_at) : first;
    const after = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    dates = [`DTSTART;VALUE=DATE:${day(first)}`, `DTEND;VALUE=DATE:${day(after)}`];
  } else {
    const start = toICSDate(item.starts_at);
    const end = toICSDate(item.ends_at) || toICSDate(new Date(new Date(item.starts_at).getTime() + 3600000));
    if (!start || !end) return "";
    dates = [`DTSTART:${start}`, `DTEND:${end}`];
  }
  const fold = (value) => String(value ?? "").replace(/[\\;,\n]/g, (c) => `\\${c}`);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Networking Buddy//EN", "BEGIN:VEVENT",
    `UID:${item.id}@networking-buddy`, `DTSTAMP:${toICSDate(new Date())}`,
    ...dates, `SUMMARY:${fold(item.title)}`,
    `DESCRIPTION:${fold(item.summary)}\\n\\n${fold(item.why_it_fits)}`,
    `LOCATION:${fold(item.location)}`, `URL:${item.action_url}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function renderResearchPanel(response) {
  const opportunities = Array.isArray(response?.opportunities) ? response.opportunities : [];
  const source = response?.source ?? "fallback";
  if (!opportunities.length) {
    const message = source === "demo"
      ? "Turn on live mode with your Claude key to search current public events and professional communities for this profile."
      : "No current matches were returned. Refresh after changing your profile or try again later.";
    return `<div class="research-empty"><p>${esc(message)}</p><button class="btn btn-small btn-ghost" data-action="refresh-research">Refresh research</button></div>`;
  }
  return `<div class="research-summary"><p>${esc(response.profile_summary ?? "Research matched to your profile.")}</p><small>Research checked ${esc(response.searched_at ?? "today")} · through ${esc(response.window_ends ?? "the next 90 days")}</small></div>
    <div class="research-list">${opportunities.map((item) => `
      <article class="card research-card">
        <div class="research-card-head"><span class="eyebrow">${item.kind === "event" ? "Upcoming event" : "People to explore"}</span>${item.on_radar ? `<span class="radar-badge">On Radar</span>` : ""}</div>
        <h3>${esc(item.title)}</h3>
        ${item.starts_at ? `<p class="research-date">📅 ${esc(opportunityDate(item))}</p>` : ""}
        ${item.location ? `<p class="research-location">📍 ${esc(item.location)}</p>` : ""}
        <p>${esc(item.summary)}</p><p class="research-fit">${esc(item.why_it_fits)}</p>
        <small class="research-source">Source: <a href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(item.source_name)}</a></small>
        <div class="research-actions">
          <a class="btn btn-small" href="${esc(item.action_url)}" target="_blank" rel="noopener">${item.kind === "event" ? "Details / RSVP" : "Explore people"}</a>
          ${item.kind === "event" && item.starts_at ? `<a class="btn btn-small btn-ghost" href="data:text/calendar;charset=utf-8,${encodeURIComponent(eventToICS(item))}" download="${esc(item.id)}.ics">Add to calendar</a>` : ""}
          <button class="btn btn-small btn-ghost" data-action="${item.on_radar ? "remove-radar" : "save-radar"}" data-opportunity-id="${esc(item.id)}">${item.on_radar ? "Remove from Radar" : "Save to Radar"}</button>
        </div>
      </article>`).join("")}</div>`;
}

export function renderDebugPanel() {
  return `
    <div class="debug-panel">
      <strong>🐞 Debug</strong> <small>local only, resets on refresh</small>
      <div class="debug-buttons">
        <button class="btn btn-small btn-ghost" data-debug-xp="10">+10 XP</button>
        <button class="btn btn-small btn-ghost" data-debug-xp="75">+75 XP</button>
        <button class="btn btn-small btn-ghost" data-debug-xp="15" data-debug-streak="1">+15 XP & streak</button>
      </div>
    </div>`;
}

export function renderHome(state, { debug = false } = {}) {
  return `
    ${debug ? renderDebugPanel() : ""}
    ${renderStats(state.user)}
    ${renderGreeting(state.user)}
    <section class="block">
      <div class="block-head"><h2>Reminders</h2>
        <button class="btn btn-small btn-ghost" data-action="refresh-coach">↻ Refresh</button></div>
      <div id="coach-cards">${renderCoachLoading()}</div>
    </section>
    <section class="block"><h2>Today's connection plan</h2><p class="muted">Real-world connections come first. Choose the next step that fits your day.</p>${renderTasks(state.tasks)}</section>
    ${renderProposedTasks(state.proposed_tasks)}
    <section class="block research-block"><div class="block-head"><div><h2>Research for you</h2><p class="muted">Current public opportunities matched to your profile.</p></div><button class="btn btn-small btn-ghost" data-action="refresh-research">↻ Refresh</button></div><div id="research-panel"><div class="skeleton"></div></div></section>
    <section class="block practice-block"><div class="block-head"><h2>Optional practice</h2><span class="xp-pill">Side quest</span></div>${renderGamePicker()}</section>`;
}

// Drafts may come back as a string or as {message|draft|text}.
export function normalizeDraft(resp) {
  if (typeof resp === "string") return resp;
  return resp?.message ?? resp?.draft ?? resp?.text ?? "";
}

export function renderDraftSheet(reminder, draft) {
  const name = reminder?.contact?.name ?? "your contact";
  return `
    <h2>Message to ${esc(name)}</h2>
    ${reminder?.reason ? `<p class="muted">${esc(reminder.reason)}</p>` : ""}
    <textarea class="draft-text" rows="7">${esc(draft)}</textarea>
    <div class="sheet-actions">
      <button class="btn" data-action="copy-draft">Copy</button>
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>
    </div>`;
}

// ---------- coach cache ----------

// Reminders call Claude, so they're cached: only Refresh fetches new ones.
let coachCache = null;

export function _resetCoachCache() {
  coachCache = null;
}

export async function loadReminders({ force = false } = {}) {
  if (!coachCache || force) {
    const resp = await post("/api/coach/reminders");
    coachCache = Array.isArray(resp?.reminders) ? resp.reminders : [];
  }
  return coachCache;
}

// ---------- screen ----------

// Updates the stats bar in place so the XP fill animates instead of jumping.
function updateStats(el, user) {
  const stats = el.querySelector(".stats");
  if (!stats) return;
  const fresh = document.createElement("div");
  fresh.innerHTML = renderStats(user);
  const next = fresh.firstElementChild;
  stats.querySelector(".streak-num").textContent = next.querySelector(".streak-num").textContent;
  stats.querySelector(".xp-label").innerHTML = next.querySelector(".xp-label").innerHTML;
  stats.querySelector(".xp-fill").style.width = next.querySelector(".xp-fill").style.width;
}

function debugXp(el, xp, streak) {
  const { state, celebration } = applyDebugXp(getState(), xp, { streak });
  _setState(state);
  updateStats(el, state.user);
  showCelebration(celebration);
}

async function showCoach(el, force) {
  const box = el.querySelector("#coach-cards");
  if (!box) return;
  if (force || !coachCache) box.innerHTML = renderCoachLoading();
  try {
    const reminders = await loadReminders({ force });
    box.innerHTML = renderCoachCards(reminders, getState()?.contacts, getState()?.today);
    box.querySelectorAll("[data-action=toggle-reminder]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const details = btn.parentElement.querySelector(".coach-details");
        const open = details.hidden;
        details.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
        btn.closest(".coach-card").classList.toggle("open", open);
      });
    });
    box.querySelectorAll("[data-coach-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = joinReminders(reminders, getState()?.contacts)[Number(btn.dataset.coachIndex)];
        openSuggestions(r);
      });
    });
  } catch (err) {
    box.innerHTML = renderCoachError(err.message);
  }
}

async function openSuggestions(reminder) {
  const body = openSheet(`<h2>Getting suggestions…</h2><div class="card skeleton"></div>`);
  try {
    const response = await post("/api/coach/suggest", { contact_id: reminder.contact_id, reason: reminder.reason ?? reminder.headline ?? "" });
    body.innerHTML = renderSuggestionSheet(reminder, response?.suggestions);
    body.querySelector("[data-action=reached-out]").addEventListener("click", () => { closeSheet(); toast("Nice work! Your outreach is logged."); });
    body.querySelector("[data-action=close-sheet]").addEventListener("click", closeSheet);
  } catch (err) {
    body.innerHTML = `<div class="error-box">Couldn't get suggestions (${esc(err.message)}).</div><button class="btn btn-ghost" data-action="close-sheet">Close</button>`;
    body.querySelector("[data-action=close-sheet]").addEventListener("click", closeSheet);
  }
}

async function openDraft(reminder) {
  const body = openSheet(`<h2>Writing a message…</h2><div class="card skeleton"></div>`);
  let draft;
  try {
    draft = normalizeDraft(await post("/api/coach/draft", {
      contact_id: reminder.contact_id,
      reason: reminder.reason ?? reminder.headline ?? "",
    }));
  } catch (err) {
    body.innerHTML = `<div class="error-box">Couldn't draft a message (${esc(err.message)}).</div>
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>`;
    body.querySelector("[data-action=close-sheet]").addEventListener("click", closeSheet);
    return;
  }
  body.innerHTML = renderDraftSheet(reminder, draft);
  body.querySelector("[data-action=copy-draft]").addEventListener("click", async () => {
    const ok = await copyText(body.querySelector(".draft-text").value);
    toast(ok ? "Copied! Paste it into your messages." : "Couldn't copy. Select the text instead.");
  });
  body.querySelector("[data-action=close-sheet]").addEventListener("click", closeSheet);
}

async function showOpportunities(el, force = false) {
  const box = el.querySelector("#research-panel");
  if (!box) return;
  box.innerHTML = `<div class="skeleton"></div>`;
  try {
    box.innerHTML = renderResearchPanel(await api(`/api/opportunities${force ? "?refresh=true" : ""}`));
  } catch (err) {
    box.innerHTML = `<div class="error-box">Research couldn't load (${esc(err.message)}). <button class="btn btn-small btn-ghost" data-action="refresh-research">Try again</button></div>`;
  }
}

registerScreen("home", {
  async show({ el }) {
    // /api/state is a local file read, so always fetch fresh XP and tasks;
    // fall back to the cache if the server hiccups.
    let state;
    try {
      state = await refreshState();
    } catch (err) {
      state = getState();
      if (!state) throw err;
    }
    el.innerHTML = renderHome(state, { debug: isDebugMode() });
    el.onclick = (e) => {
      if (e.target.closest("[data-action=refresh-coach]")) showCoach(el, true);
      if (e.target.closest("[data-action=refresh-research]")) showOpportunities(el, true);
      const accept = e.target.closest("[data-action=accept-task]");
      if (accept) {
        const taskId = accept.dataset.taskId;
        const frequency = el.querySelector(`[data-frequency-for="${taskId}"]`)?.value || "once";
        post(`/api/tasks/${encodeURIComponent(taskId)}/accept`, { frequency }).then(async () => {
          toast("Task added to your plan!");
          const fresh = await refreshState();
          el.innerHTML = renderHome(fresh, { debug: isDebugMode() });
          showCoach(el, false);
          showOpportunities(el);
        }).catch((err) => toast(`Couldn't accept: ${err.message}`));
      }
      const reject = e.target.closest("[data-action=reject-task]");
      if (reject) {
        post(`/api/tasks/${encodeURIComponent(reject.dataset.taskId)}/reject`).then(() => {
          el.querySelector(`[data-proposal-id="${reject.dataset.taskId}"]`)?.remove();
          toast("Skipped.");
        }).catch((err) => toast(`Couldn't skip: ${err.message}`));
      }
      if (e.target.closest("[data-action=refresh-proposals]")) {
        post("/api/coach/propose-tasks").then(async () => {
          const fresh = await refreshState();
          el.innerHTML = renderHome(fresh, { debug: isDebugMode() });
          showCoach(el, false);
          showOpportunities(el);
        }).catch((err) => toast(`Couldn't get suggestions: ${err.message}`));
      }
      const radar = e.target.closest("[data-action=save-radar], [data-action=remove-radar]");
      if (radar) {
        const saved = radar.dataset.action === "save-radar";
        radar.disabled = true;
        api(`/api/opportunities/${encodeURIComponent(radar.dataset.opportunityId)}/radar`, { method: saved ? "POST" : "DELETE" })
          .then(() => showOpportunities(el))
          .then(() => toast(saved ? "Saved to your Radar" : "Removed from your Radar"))
          .catch((err) => { radar.disabled = false; toast(`Couldn't update Radar: ${err.message}`); });
      }
      const dbg = e.target.closest("[data-debug-xp]");
      if (dbg) debugXp(el, Number(dbg.dataset.debugXp), dbg.hasAttribute("data-debug-streak"));
    };
    showCoach(el, false);
    showOpportunities(el);
  },
});
