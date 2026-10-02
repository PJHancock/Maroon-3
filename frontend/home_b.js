// home_b.js — streak, XP, coach cards, draft sheet, task list, game picker.
// Owner: Teammate B. Render functions are pure (data -> HTML) so they're unit-tested.

import {
  registerScreen, getState, refreshState, post, esc,
  openSheet, closeSheet, copyText, toast,
  isDebugMode, applyDebugXp, showCelebration, _setState,
} from "./app_b.js";

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

export function renderCoachCards(reminders, contacts) {
  const cards = joinReminders(reminders, contacts);
  if (!cards.length) {
    return `<div class="empty">No suggestions right now. Complete a task to meet someone new!</div>`;
  }
  return cards.map((r, i) => {
    const name = r.contact?.name ?? "A contact";
    const sub = [r.contact?.role, r.contact?.company].filter(Boolean).join(" · ");
    return `
      <button class="card coach-card" data-coach-index="${i}">
        <div class="coach-who"><span class="avatar">${esc(name[0] ?? "?")}</span>
          <span><strong>${esc(name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span></div>
        <div class="coach-headline">${esc(r.headline ?? "Worth reaching out")}</div>
        ${r.reason ? `<p class="coach-reason">${esc(r.reason)}</p>` : ""}
        ${r.suggested_action ? `<p class="coach-action">👉 ${esc(r.suggested_action)}</p>` : ""}
        ${r.tip ? `<p class="coach-tip">💡 ${esc(r.tip)}</p>` : ""}
        <span class="coach-cta">Draft a message →</span>
      </button>`;
  }).join("");
}

export function renderCoachLoading() {
  return `<div class="card skeleton"></div><div class="card skeleton"></div>`;
}

export function renderCoachError(message) {
  return `<div class="error-box">The coach couldn't load (${esc(message)}).
    <button class="btn btn-small" data-action="refresh-coach">Try again</button></div>`;
}

export function renderTasks(tasks) {
  const open = (Array.isArray(tasks) ? tasks : []).filter((t) => (t.status ?? "open") === "open");
  if (!open.length) return `<div class="empty">All tasks done. Nice work!</div>`;
  return open.map((t) => `
    <a class="card task-card" href="#/task/${encodeURIComponent(t.id)}">
      <span class="task-icon">${t.type === "in_person" ? "🤝" : "✅"}</span>
      <span class="task-title">${esc(t.title)}</span>
      <span class="xp-pill">+${Number(t.xp) || 0} XP</span>
    </a>`).join("");
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
      <div class="block-head"><h2>Your coach</h2>
        <button class="btn btn-small btn-ghost" data-action="refresh-coach">↻ Refresh</button></div>
      <div id="coach-cards">${renderCoachLoading()}</div>
    </section>
    <section class="block"><h2>In-person tasks</h2>${renderTasks(state.tasks)}</section>
    <section class="block"><h2>Practice</h2>${renderGamePicker()}</section>`;
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
    box.innerHTML = renderCoachCards(reminders, getState()?.contacts);
    box.querySelectorAll("[data-coach-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = joinReminders(reminders, getState()?.contacts)[Number(btn.dataset.coachIndex)];
        openDraft(r);
      });
    });
  } catch (err) {
    box.innerHTML = renderCoachError(err.message);
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
      const dbg = e.target.closest("[data-debug-xp]");
      if (dbg) debugXp(el, Number(dbg.dataset.debugXp), dbg.hasAttribute("data-debug-streak"));
    };
    showCoach(el, false);
  },
});
