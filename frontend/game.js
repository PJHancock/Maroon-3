// game.js — practice games: a chat with an AI persona, then a score screen, both
// inside #/game/{id}. Home imports GAMES from here for the game picker.

import { registerScreen, getState, refreshState, post, esc, navigate, celebrate } from "./app.js";

// Mirrors backend/games.py (title, turns, XP); icon and blurb are UI-only.
export const GAMES = [
  { id: "elevator_pitch", title: "Elevator Pitch", maxTurns: 1, xp: 10, icon: "🎤", blurb: "30 seconds to make an impression" },
  { id: "coffee_chat", title: "Coffee Chat", maxTurns: 4, xp: 15, icon: "☕", blurb: "Learn about their work" },
  { id: "follow_up", title: "Follow-Up", maxTurns: 1, xp: 10, icon: "✉️", blurb: "Give them a reason to reply" },
  { id: "cold_call", title: "Cold Outreach", maxTurns: 3, xp: 20, icon: "📞", blurb: "Earn a reply from a stranger" },
];

export function findGame(id) {
  return GAMES.find((g) => g.id === id) ?? null;
}

// The privacy-scoped context sent with /start, /turn, and /score so the persona
// and the scorer can reference the student's goals and contacts.
export function buildGameContext(state) {
  const user = state?.user ?? {};
  return {
    user: {
      name: user.name || "",
      school: user.school || "",
      major: user.major || "",
      target_roles: Array.isArray(user.target_roles) ? user.target_roles.slice(0, 5) : [],
    },
    contacts: (state?.contacts ?? []).slice(0, 8).map((c) => ({
      id: c.id, name: c.name, role: c.role, company: c.company,
      notes: Array.isArray(c.notes) ? c.notes.slice(0, 4) : [],
      last_contact: c.last_contact || null,
    })),
    open_tasks: (state?.tasks ?? []).filter((t) => (t.status ?? "open") === "open").slice(0, 8)
      .map((t) => ({ id: t.id, title: t.title, type: t.type, description: t.description })),
    recent_game_sessions: (state?.game_sessions ?? []).slice(0, 5)
      .map((s) => ({ game: s.game, date: s.date, scores: s.scores || {} })),
  };
}

export function contextLabel(context) {
  const name = context?.user?.name;
  const n = context?.contacts?.length ?? 0;
  if (name && n) return `Personalized for ${name} · ${n} remembered connection${n === 1 ? "" : "s"}`;
  if (name) return `Personalized for ${name}`;
  return "Personalized using your networking context";
}

// /start may say opening_line (backend) or opening/message (older shapes).
export function normalizeStart(result, game) {
  return {
    title: result?.title || game.title,
    goal: result?.goal || "Practice one small networking skill.",
    maxTurns: Number(result?.max_turns) || game.maxTurns,
    opening: result?.opening_line || result?.opening || result?.message || "",
  };
}

export function replyFrom(result) {
  return result?.reply || result?.message || result?.response || result?.content || "";
}

export function turnLabel(turn, maxTurns) {
  return maxTurns <= 1 ? "One response" : `Turn ${turn} of ${maxTurns}`;
}

// ---------- pure renderers ----------

export function renderMessages(history) {
  if (!history?.length) return `<div class="empty">Your conversation will appear here.</div>`;
  return history.map((m) => {
    const you = m.role === "user";
    return `<div class="chat-msg ${you ? "chat-msg--you" : "chat-msg--them"}">
      <span class="chat-label">${you ? "You" : "Them"}</span><p>${esc(m.content)}</p></div>`;
  }).join("");
}

export function renderChat(session) {
  const single = session.maxTurns <= 1;
  return `
    <div class="screen-heading">
      <div>
        <p class="eyebrow">Practice game</p>
        <h1>${esc(session.title)}</h1>
        <p class="muted">${esc(session.goal)}</p>
        <p class="personalized">✦ ${esc(contextLabel(session.context))}</p>
      </div>
      <span class="xp-pill turn-counter">${turnLabel(session.turn, session.maxTurns)}</span>
    </div>
    <div class="chat-thread" aria-live="polite">${renderMessages(session.history)}</div>
    <div class="error-box" data-game-error hidden></div>
    <form class="chat-composer">
      <label class="sr-only" for="chat-input">Your response</label>
      <textarea id="chat-input" class="chat-input" rows="3" placeholder="Write what you would say…"></textarea>
      <div class="sheet-actions">
        <button class="btn" type="submit" data-send>${single ? "Get feedback" : "Send"}</button>
        ${single ? "" : `<button class="btn btn-ghost" type="button" data-finish>Finish</button>`}
      </div>
    </form>`;
}

export function renderScore(result, game) {
  const scores = Object.entries(result?.scores ?? {}).map(([label, value]) => {
    const n = Math.max(0, Math.min(5, Number(value) || 0));
    return `<div class="score-row">
      <div class="score-row-head"><strong>${esc(label.replaceAll("_", " "))}</strong><span>${n}/5</span></div>
      <div class="xp-bar"><div class="xp-fill" style="width:${n * 20}%"></div></div></div>`;
  }).join("");
  const next = result?.recommended_follow_up || result?.follow_up_question || result?.next_question;
  const xp = Number(result?.xp ?? game?.xp) || 0;
  return `
    <p class="eyebrow">Session complete</p>
    <h1>Good work showing up.</h1>
    <p class="muted">Keep what worked, then try the one fix below in your next real conversation.</p>
    <div class="xp-banner"><strong>+${xp} XP</strong><span>Progress beats perfection.</span></div>
    <div class="card"><h2>Your score</h2>${scores || `<p class="muted">No rubric scores came back.</p>`}</div>
    <div class="card feedback feedback--good"><p class="eyebrow">Best moment</p><p>${esc(result?.best_moment || "You finished the practice and gave yourself something to improve on.")}</p></div>
    <div class="card feedback"><p class="eyebrow">One fix</p><p>${esc(result?.one_fix || "Make your next question more specific to the person you're talking with.")}</p></div>
    <div class="card feedback feedback--example"><p class="eyebrow">Try this version</p><p>${esc(result?.rewrite_example || "Connect your question to something they actually mentioned.")}</p></div>
    ${next ? `<div class="card feedback feedback--next"><p class="eyebrow">A thoughtful next question</p><p>${esc(next)}</p></div>` : ""}
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="retry">Try again</button>
      <button class="btn" data-action="home">Back to home</button>
    </div>`;
}

export function renderGameError(message) {
  return `
    <div class="error-box">${esc(message)}</div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="retry">Try again</button>
      <button class="btn" data-action="home">Back to home</button>
    </div>`;
}

// ---------- screen ----------

// Each visit gets a token so replies to an abandoned game are ignored.
let currentToken = 0;

async function startGame(el, game) {
  const token = ++currentToken;
  const live = () => token === currentToken;
  el.innerHTML = `<div class="loading">Starting your practice…</div>`;

  let state = getState();
  try {
    state = state ?? (await refreshState());
  } catch {
    // A game still runs without context if /api/state is down.
  }
  const session = { id: game.id, title: game.title, goal: "", maxTurns: game.maxTurns, turn: 0, history: [], context: buildGameContext(state), busy: false };

  try {
    const start = normalizeStart(await post(`/api/games/${game.id}/start`, { context: session.context }), game);
    if (!live()) return;
    Object.assign(session, { title: start.title, goal: start.goal, maxTurns: start.maxTurns });
    if (start.opening) session.history.push({ role: "assistant", content: start.opening });
  } catch (err) {
    if (live()) el.innerHTML = renderGameError(`Couldn't start the game: ${err.message}`);
    return;
  }

  // Redraws the chat with fresh, enabled controls.
  const draw = () => {
    session.busy = false;
    el.innerHTML = renderChat(session);
    const thread = el.querySelector(".chat-thread");
    thread.scrollTop = thread.scrollHeight;
    const input = el.querySelector(".chat-input");
    const form = el.querySelector(".chat-composer");
    const sendBtn = el.querySelector("[data-send]");
    const outOfTurns = session.maxTurns > 1 && session.turn >= session.maxTurns;
    if (outOfTurns) {
      sendBtn.disabled = true;
      input.disabled = true;
      input.placeholder = "That's all the turns. Tap Finish for feedback.";
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      send();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    el.querySelector("[data-finish]")?.addEventListener("click", finish);
    if (!outOfTurns) input.focus();
  };

  const setBusy = (busy, label) => {
    session.busy = busy;
    el.querySelectorAll(".chat-composer button, .chat-input").forEach((x) => (x.disabled = busy));
    if (busy && label) el.querySelector("[data-send]").textContent = label;
  };

  const showError = (message) => {
    const box = el.querySelector("[data-game-error]");
    if (box) {
      box.textContent = message;
      box.hidden = !message;
    }
  };

  async function send() {
    if (session.busy) return;
    const input = el.querySelector(".chat-input");
    const content = input.value.trim();
    if (!content) return showError("Write a response first.");
    session.history.push({ role: "user", content });
    if (session.maxTurns <= 1) return finish();
    draw();
    setBusy(true, "Thinking…");
    try {
      const reply = replyFrom(await post(`/api/games/${game.id}/turn`, { history: session.history, context: session.context }));
      if (!live()) return;
      if (!reply) throw new Error("The game sent back an empty reply.");
      session.history.push({ role: "assistant", content: reply });
      session.turn += 1;
      draw();
    } catch (err) {
      if (!live()) return;
      session.history.pop();
      draw();
      el.querySelector(".chat-input").value = content;
      showError(`Couldn't continue the game: ${err.message}`);
    }
  }

  async function finish() {
    if (session.busy) return;
    if (!session.history.some((m) => m.role === "user")) return showError("Add at least one response before asking for feedback.");
    setBusy(true, "Scoring…");
    try {
      const result = await post(`/api/games/${game.id}/score`, { history: session.history, context: session.context });
      if (!live()) return;
      el.innerHTML = renderScore(result, game);
      window.scrollTo(0, 0);
      celebrate(Number(result?.xp) || undefined);
    } catch (err) {
      if (!live()) return;
      if (session.maxTurns <= 1) session.history.pop();
      draw();
      showError(`Couldn't score this session: ${err.message}`);
    }
  }

  draw();
}

registerScreen("game", {
  show({ id, el }) {
    el.onclick = (e) => {
      if (e.target.closest("[data-action=retry]")) startGame(el, game);
      if (e.target.closest("[data-action=home]")) navigate("#/home");
    };
    const game = findGame(id);
    if (!game) {
      currentToken++;
      el.innerHTML = `<div class="error-box">That game doesn't exist.</div>
        <button class="btn" data-action="home">Back to home</button>`;
      return;
    }
    return startGame(el, game);
  },
});
