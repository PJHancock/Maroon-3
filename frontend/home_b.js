// home_b.js — streak, XP, coach cards, draft sheet, task list, game picker.
// Owner: Teammate B. Render functions are pure (data -> HTML) so they're unit-tested.

import {
  registerScreen, getState, refreshState, post, esc,
  openSheet, closeSheet, toast, normalizeState,
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
        <span class="coach-cta">Get suggestions →</span>
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
        <span class="task-title"><small>${esc(meta.label)} · ${esc(difficulty)}${t.frequency && t.frequency !== "once" ? ` · ${t.frequency}` : ""}${t.skill ? ` · ${esc(t.skill)}` : ""}</small><strong>${esc(t.title)}</strong>${t.description ? `<em>${esc(t.description)}</em>` : ""}${t.location ? `<em>${esc(t.location)}</em>` : ""}</span>
        <span class="xp-pill">+${Number(t.xp) || 0} XP</span>
      </a>`;
  }).join("");
}

export function renderProposedTasks(proposedTasks) {
  const tasks = Array.isArray(proposedTasks) ? proposedTasks : [];
  if (!tasks.length) return "";
  return `
    <section class="block">
      <div class="block-head"><h2>Suggested for you</h2>
        <button class="btn btn-small btn-ghost" data-action="refresh-proposals">↻ New ideas</button></div>
      <p class="muted">The coach proposed these tasks. Accept the ones that fit your goals.</p>
      ${tasks.map((t) => {
        const meta = TASK_PRIORITY[t.type] ?? { label: "Connection", icon: "✅", priority: 6 };
        return `
          <div class="card proposal-card" data-proposal-id="${esc(t.id)}">
            <div class="proposal-header">
              <span class="task-icon">${meta.icon}</span>
              <span class="task-title">
                <strong>${esc(t.title)}</strong>
                ${t.description ? `<em>${esc(t.description)}</em>` : ""}
                ${t.skill ? `<span class="skill-badge">${esc(t.skill)}</span>` : ""}
              </span>
              <span class="xp-pill">+${Number(t.xp) || 0} XP</span>
            </div>
            <div class="proposal-actions">
              <select class="frequency-select" data-frequency-for="${esc(t.id)}">
                <option value="once">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly"${t.frequency === "weekly" ? " selected" : ""}>Weekly</option>
              </select>
              <button class="btn btn-small" data-action="accept-task" data-task-id="${esc(t.id)}">Accept</button>
              <button class="btn btn-small btn-ghost" data-action="reject-task" data-task-id="${esc(t.id)}">Skip</button>
            </div>
          </div>`;
      }).join("")}
    </section>`;
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

export function renderOnboarding(user) {
  return `
    <div class="onboarding">
      <h1>Welcome${user?.name ? `, ${esc(user.name)}` : ""}!</h1>
      <p class="muted">How would you like to start your networking journey?</p>
      <div class="onboarding-choices">
        <button class="card onboarding-card" data-goal="job">
          <span class="onboarding-icon">🎯</span>
          <strong>I have a target role</strong>
          <p class="muted">I know the kind of job I want and I'm ready to network toward it.</p>
        </button>
        <button class="card onboarding-card" data-goal="company">
          <span class="onboarding-icon">🏢</span>
          <strong>I have a target company</strong>
          <p class="muted">I want to learn about and connect with people at a specific company.</p>
        </button>
        <button class="card onboarding-card" data-goal="general">
          <span class="onboarding-icon">🌐</span>
          <strong>I want to explore</strong>
          <p class="muted">I want to network generally and find new connections in my field.</p>
        </button>
      </div>
    </div>`;
}

export function renderOnboardingDetail(goal) {
  if (goal === "general") return null;
  const label = goal === "job" ? "What role are you targeting?" : "What company interests you?";
  const placeholder = goal === "job" ? "e.g. Data Engineer" : "e.g. Qualtrics";
  const fieldName = goal === "job" ? "target_role" : "target_company";
  return `
    <div class="onboarding-detail">
      <h2>${label}</h2>
      <form class="onboarding-form" novalidate>
        <label class="field"><span>${label}</span>
          <input name="${fieldName}" autocomplete="off" placeholder="${placeholder}"></label>
        <div class="sheet-actions">
          <button class="btn" type="submit">Get started</button>
          <button class="btn btn-ghost" type="button" data-action="back-onboarding">Back</button>
        </div>
      </form>
    </div>`;
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
  if (!state.user?.onboarding_goal) {
    return renderOnboarding(state.user);
  }
  return `
    ${debug ? renderDebugPanel() : ""}
    ${renderStats(state.user)}
    ${renderGreeting(state.user)}
    <section class="block">
      <div class="block-head"><h2>Your coach</h2>
        <button class="btn btn-small btn-ghost" data-action="refresh-coach">↻ Refresh</button></div>
      <div id="coach-cards">${renderCoachLoading()}</div>
    </section>
    <section class="block"><h2>Today's connection plan</h2><p class="muted">Real-world connections come first. Choose the next step that fits your day.</p>${renderTasks(state.tasks)}</section>
    ${renderProposedTasks(state.proposed_tasks)}
    <section class="block practice-block"><div class="block-head"><h2>Optional practice</h2><span class="xp-pill">Side quest</span></div>${renderGamePicker()}</section>`;
}

// Drafts may come back as a string or as {message|draft|text}.
export function normalizeDraft(resp) {
  if (typeof resp === "string") return resp;
  return resp?.message ?? resp?.draft ?? resp?.text ?? "";
}

export function renderSuggestionSheet(reminder, suggestions) {
  const name = reminder?.contact?.name ?? "your contact";
  const items = (Array.isArray(suggestions) ? suggestions : []).map(
    (s) => `<li>${esc(s)}</li>`
  ).join("");
  return `
    <h2>Suggestions for ${esc(name)}</h2>
    ${reminder?.reason ? `<p class="muted">${esc(reminder.reason)}</p>` : ""}
    <p>You could ask about:</p>
    <ul class="suggestion-list">${items}</ul>
    <div class="sheet-actions">
      <button class="btn" data-action="reached-out">I reached out ✓</button>
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
        openSuggestions(r);
      });
    });
  } catch (err) {
    box.innerHTML = renderCoachError(err.message);
  }
}

async function openSuggestions(reminder) {
  const body = openSheet(`<h2>Getting suggestions…</h2><div class="card skeleton"></div>`);
  let suggestions;
  try {
    const resp = await post("/api/coach/suggest", {
      contact_id: reminder.contact_id,
      reason: reminder.reason ?? reminder.headline ?? "",
    });
    suggestions = Array.isArray(resp?.suggestions) ? resp.suggestions : [];
  } catch (err) {
    body.innerHTML = `<div class="error-box">Couldn't get suggestions (${esc(err.message)}).</div>
      <button class="btn btn-ghost" data-action="close-sheet">Close</button>`;
    body.querySelector("[data-action=close-sheet]").addEventListener("click", closeSheet);
    return;
  }
  body.innerHTML = renderSuggestionSheet(reminder, suggestions);
  body.querySelector("[data-action=reached-out]").addEventListener("click", () => {
    closeSheet();
    toast("Nice work! Your outreach is logged.");
  });
  body.querySelector("[data-action=close-sheet]").addEventListener("click", closeSheet);
}

function wireHomeActions(el) {
  el.onclick = async (e) => {
    if (e.target.closest("[data-action=refresh-coach]")) showCoach(el, true);
    const dbg = e.target.closest("[data-debug-xp]");
    if (dbg) debugXp(el, Number(dbg.dataset.debugXp), dbg.hasAttribute("data-debug-streak"));

    // Task proposal actions
    const acceptBtn = e.target.closest("[data-action=accept-task]");
    if (acceptBtn) {
      const taskId = acceptBtn.dataset.taskId;
      const select = el.querySelector(`[data-frequency-for="${taskId}"]`);
      const frequency = select?.value || "once";
      try {
        await post(`/api/tasks/${encodeURIComponent(taskId)}/accept`, { frequency });
        toast("Task added to your plan!");
        const state = await refreshState();
        el.innerHTML = renderHome(state, { debug: isDebugMode() });
        wireHomeActions(el);
        showCoach(el, false);
      } catch (err) {
        toast(`Couldn't accept: ${err.message}`);
      }
    }

    const rejectBtn = e.target.closest("[data-action=reject-task]");
    if (rejectBtn) {
      const taskId = rejectBtn.dataset.taskId;
      try {
        await post(`/api/tasks/${encodeURIComponent(taskId)}/reject`);
        const card = el.querySelector(`[data-proposal-id="${taskId}"]`);
        if (card) card.remove();
        toast("Skipped.");
      } catch (err) {
        toast(`Couldn't skip: ${err.message}`);
      }
    }

    if (e.target.closest("[data-action=refresh-proposals]")) {
      try {
        const resp = await post("/api/coach/propose-tasks");
        const state = await refreshState();
        el.innerHTML = renderHome(state, { debug: isDebugMode() });
        wireHomeActions(el);
        showCoach(el, false);
      } catch (err) {
        toast(`Couldn't get suggestions: ${err.message}`);
      }
    }
  };
}

registerScreen("home", {
  async show({ el }) {
    let state;
    try {
      state = await refreshState();
    } catch (err) {
      state = getState();
      if (!state) throw err;
    }
    el.innerHTML = renderHome(state, { debug: isDebugMode() });

    // Onboarding flow
    if (!state.user?.onboarding_goal) {
      el.onclick = async (e) => {
        const card = e.target.closest("[data-goal]");
        if (!card) return;
        const goal = card.dataset.goal;
        if (goal === "general") {
          // Skip the detail form for general networking
          try {
            state = await post("/api/onboarding", { goal: "general" });
            _setState(state);
            el.innerHTML = renderHome(normalizeState(state), { debug: isDebugMode() });
            wireHomeActions(el);
            showCoach(el, false);
          } catch (err) {
            toast(`Couldn't save: ${err.message}`);
          }
          return;
        }
        const detail = renderOnboardingDetail(goal);
        if (detail) {
          el.innerHTML = detail;
          const form = el.querySelector(".onboarding-form");
          form.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const data = Object.fromEntries(new FormData(form));
            try {
              state = await post("/api/onboarding", { goal, ...data });
              _setState(state);
              el.innerHTML = renderHome(normalizeState(state), { debug: isDebugMode() });
              wireHomeActions(el);
              showCoach(el, false);
            } catch (err) {
              toast(`Couldn't save: ${err.message}`);
            }
          });
          el.querySelector("[data-action=back-onboarding]")?.addEventListener("click", () => {
            el.innerHTML = renderHome(state, { debug: isDebugMode() });
          });
        }
      };
      return;
    }

    wireHomeActions(el);
    showCoach(el, false);
  },
});
