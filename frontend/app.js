// app.js — shared shell: hash router, api() helper, state cache, and UI helpers.
// Owner: Teammate B. Other screens import from here; this is the contract:
//
//   registerScreen(name, { show(params, data) })  render into <section id="screen-{name}">
//   navigate(route, data)                          go to "#/game/coffee_chat", passing optional data
//   api(path, { method, body })  / post(path, body)
//   getState() / refreshState()                    cached GET /api/state
//   celebrate(xpGained)                            call after any XP-earning action
//   openSheet(html) / closeSheet() / toast(text) / esc(text)
//
// Nothing here touches the DOM at import time, so Node tests can import it.

import { mockApi } from "./mock.js";

// ---------- small utilities ----------

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Whole days between an ISO date ("2026-09-10") and today. null if unparseable.
export function daysSince(isoDate, today = todayISO()) {
  if (!isoDate) return null;
  const a = Date.parse(String(isoDate).slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// ---------- api ----------

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let mockOverride = null;

// Mock mode: add ?mock=1 to the URL. Tests can force it with setMockMode().
export function setMockMode(on) {
  mockOverride = on;
}

export function isMockMode() {
  if (mockOverride !== null) return mockOverride;
  const search = globalThis.location?.search ?? "";
  return new URLSearchParams(search).get("mock") === "1";
}

export async function api(path, { method, body } = {}) {
  method = method ?? (body === undefined ? "GET" : "POST");

  if (isMockMode()) {
    try {
      return await mockApi(method, path, body);
    } catch (err) {
      throw new ApiError(err.message, err.status ?? 500);
    }
  }

  let resp;
  try {
    resp = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new ApiError(`Can't reach the server (${err.message})`, 0);
  }

  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(`Server sent something that isn't JSON (${resp.status})`, resp.status);
    }
  }
  if (!resp.ok) {
    const detail = data?.detail ?? resp.statusText;
    throw new ApiError(`${method} ${path} failed: ${detail}`, resp.status);
  }
  return data;
}

export function post(path, body = {}) {
  return api(path, { method: "POST", body });
}

// ---------- state ----------

// Accepts whatever /api/state returns and fills in safe defaults, so a missing
// or renamed field never crashes a screen.
export function normalizeState(raw) {
  const s = raw ?? {};
  const user = s.user ?? {};
  return {
    ...s,
    user: {
      ...user,
      name: user.name ?? "You",
      xp: Number(user.xp) || 0,
      streak: Number(user.streak) || 0,
    },
    contacts: Array.isArray(s.contacts) ? s.contacts : [],
    tasks: Array.isArray(s.tasks) ? s.tasks : Array.isArray(s.open_tasks) ? s.open_tasks : [],
    game_sessions: Array.isArray(s.game_sessions) ? s.game_sessions : [],
  };
}

let state = null;

export function getState() {
  return state;
}

export async function refreshState() {
  state = normalizeState(await api("/api/state"));
  return state;
}

// Test hook.
export function _setState(s) {
  state = s === null ? null : normalizeState(s);
}

// ---------- router ----------

export const SCREENS = ["home", "contacts", "game", "score", "task"];

const screens = {};
let started = false;
let routeData = null;

// "#/game/coffee_chat" -> { name: "game", id: "coffee_chat" }. Unknown -> home.
export function parseRoute(hash) {
  const parts = String(hash ?? "")
    .replace(/^#\/?/, "")
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const name = parts[0] ?? "home";
  if (!SCREENS.includes(name)) return { name: "home", id: null };
  return { name, id: parts[1] ?? null };
}

export function registerScreen(name, screen) {
  screens[name] = screen;
  // A screen whose script loaded after startup still renders if it's on-screen.
  if (started && parseRoute(globalThis.location?.hash).name === name) render();
}

export function getScreen(name) {
  return screens[name];
}

export function navigate(route, data = null) {
  routeData = data;
  const hash = route.startsWith("#") ? route : `#${route}`;
  if (globalThis.location.hash === hash) render();
  else globalThis.location.hash = hash;
}

async function render() {
  const route = parseRoute(location.hash);
  const data = routeData;
  routeData = null;

  for (const name of SCREENS) {
    const el = document.getElementById(`screen-${name}`);
    if (el) el.hidden = name !== route.name;
  }
  document.querySelectorAll("[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === route.name);
  });

  const el = document.getElementById(`screen-${route.name}`);
  const screen = screens[route.name];
  if (!screen) {
    if (el) el.innerHTML = `<div class="empty">This screen isn't built yet.</div>`;
    return;
  }
  try {
    await screen.show({ id: route.id, el }, data);
  } catch (err) {
    console.error(err);
    if (el) el.innerHTML = `<div class="error-box">Something went wrong: ${esc(err.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

// ---------- UI helpers ----------

export function toast(text, ms = 2200) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function openSheet(html) {
  closeSheet();
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-handle"></div><div class="sheet-body">${html}</div></div>`;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet();
  });
  document.body.appendChild(backdrop);
  return backdrop.querySelector(".sheet-body");
}

export function closeSheet() {
  document.querySelector(".sheet-backdrop")?.remove();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs HTTPS or localhost; fall back to the old way.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// ---------- celebrate ----------

// Pure: what to celebrate given state before and after an XP action.
export function computeCelebration(before, after, xpGained) {
  const b = before?.user ?? {};
  const a = after?.user ?? {};
  const xp = Number.isFinite(xpGained) ? xpGained : Math.max(0, (a.xp ?? 0) - (b.xp ?? 0));
  return {
    xp,
    streakUp: (a.streak ?? 0) > (b.streak ?? 0),
    streak: a.streak ?? 0,
  };
}

// Call after any XP-earning action (game score, task completion). Refreshes
// state and plays the "+N XP" / streak "+1" moment. Safe to call from any screen.
export async function celebrate(xpGained) {
  const before = state;
  let after = before;
  try {
    after = await refreshState();
  } catch (err) {
    console.error(err);
  }
  const c = computeCelebration(before, after, xpGained);
  if (typeof document === "undefined") return c;

  const el = document.createElement("div");
  el.className = "celebrate";
  el.innerHTML = `
    ${c.xp > 0 ? `<div class="celebrate-xp">+${c.xp} XP</div>` : ""}
    ${c.streakUp ? `<div class="celebrate-streak">🔥 ${c.streak} day streak! <span>+1</span></div>` : ""}`;
  if (c.xp > 0 || c.streakUp) {
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
  return c;
}

// ---------- startup ----------

function start() {
  started = true;
  window.addEventListener("hashchange", render);
  render();
}

if (typeof document !== "undefined") {
  // Module scripts run before DOMContentLoaded, so waiting for it lets every
  // screen module register before the first render.
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", start);
  else start();
}
