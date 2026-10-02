(function (root) {
  "use strict";

  const Buddy = (root.NetworkingBuddy = root.NetworkingBuddy || {});
  const GAME_CONFIGS = {
    elevator_pitch: { title: "Elevator Pitch", maxTurns: 1, xp: 10 },
    coffee_chat: { title: "Coffee Chat", maxTurns: 4, xp: 15 },
    follow_up: { title: "Follow-Up", maxTurns: 1, xp: 10 },
    cold_call: { title: "Cold Outreach", maxTurns: 3, xp: 20 },
  };

  const state = {
    game: null,
    title: "",
    goal: "",
    history: [],
    turn: 0,
    maxTurns: 1,
    waiting: false,
    options: {},
    context: {},
  };

  function api() {
    if (!Buddy.api) throw new Error("No Nudge API adapter has been configured.");
    return Buddy.api;
  }

  function getElement(idOrElement) {
    if (!idOrElement) return null;
    if (typeof idOrElement !== "string") return idOrElement;
    return document.querySelector(idOrElement.startsWith("#") ? idOrElement : `#${idOrElement}`);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function show(element, visible) {
    if (element) element.hidden = !visible;
  }

  function containerFor(key, fallback) {
    return getElement(state.options[key] || fallback);
  }

  function setStatus(message, kind) {
    if (typeof state.options.onStatus === "function") state.options.onStatus(message, kind);
    const status = getElement(state.options.status || "#c-status");
    if (status) {
      status.textContent = message || "";
      status.dataset.kind = kind || "";
      status.hidden = !message;
    }
  }

  function request(path, options) {
    return Promise.resolve().then(() => api()(path, options || {}));
  }

  function parseResponse(response) {
    if (!response) return {};
    if (typeof response.json === "function") return response.json();
    return response;
  }

  function requestJson(path, body) {
    return request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(parseResponse);
  }

  function buildGameContext(data) {
    const user = data?.user || {};
    return {
      user: {
        name: user.name || "",
        school: user.school || "",
        major: user.major || "",
        target_roles: Array.isArray(user.target_roles) ? user.target_roles.slice(0, 5) : [],
      },
      contacts: (data?.contacts || []).slice(0, 8).map((contact) => ({
        id: contact.id,
        name: contact.name,
        role: contact.role,
        company: contact.company,
        notes: Array.isArray(contact.notes) ? contact.notes.slice(0, 4) : [],
        last_contact: contact.last_contact || null,
      })),
      open_tasks: (data?.open_tasks || data?.tasks || []).filter((task) => task.status !== "complete").slice(0, 8).map((task) => ({
        id: task.id,
        title: task.title,
        type: task.type,
        description: task.description,
      })),
      recent_game_sessions: (data?.game_sessions || []).slice(0, 5).map((session) => ({
        game: session.game,
        date: session.date,
        scores: session.scores || {},
      })),
    };
  }

  async function loadGameContext() {
    try {
      const data = await request("/api/state").then(parseResponse);
      return buildGameContext(data);
    } catch (_) {
      // A game can still run if the profile endpoint is temporarily unavailable.
      return {};
    }
  }

  function contextLabel() {
    const user = state.context.user || {};
    const contacts = state.context.contacts || [];
    if (user.name && contacts.length) return `Personalized for ${user.name} · ${contacts.length} remembered connection${contacts.length === 1 ? "" : "s"}`;
    if (user.name) return `Personalized for ${user.name}`;
    return "Personalized using your networking context";
  }

  function renderShell() {
    const gameContainer = containerFor("gameContainer", "#screen-game");
    const scoreContainer = containerFor("scoreContainer", "#screen-score");
    show(gameContainer, true);
    show(scoreContainer, false);
    if (!gameContainer) throw new Error("Missing game screen container.");

    const config = GAME_CONFIGS[state.game] || { title: state.title || state.game, maxTurns: state.maxTurns };
    const singleTurn = state.maxTurns <= 1;
    gameContainer.innerHTML = `
      <div class="screen-heading">
        <div>
          <p class="eyebrow">Practice game</p>
          <h1>${escapeHtml(state.title || config.title)}</h1>
          <p class="game-goal">${escapeHtml(state.goal)}</p>
          <p class="personalization-note">✦ ${escapeHtml(contextLabel())}</p>
        </div>
        <div class="turn-counter" aria-live="polite">${singleTurn ? "One response" : `Turn ${state.turn} of ${state.maxTurns}`}</div>
      </div>
      <div class="chat-thread" data-chat-thread aria-live="polite"></div>
      <div class="game-error" data-game-error hidden></div>
      <form class="game-composer" data-game-form>
        <label class="sr-only" for="game-input">Your response</label>
        <textarea id="game-input" data-game-input rows="3" placeholder="Write what you would say..." required></textarea>
        <div class="game-actions">
          <button class="button button-primary" type="submit" data-send>${singleTurn ? "Add response" : "Send"}</button>
          <button class="button button-secondary" type="button" data-finish>${singleTurn ? "Get feedback" : "Finish"}</button>
        </div>
      </form>`;
    renderHistory();
    bindGameEvents();
  }

  function renderHistory() {
    const thread = getElement(state.options.gameContainer || "#screen-game")?.querySelector("[data-chat-thread]");
    if (!thread) return;
    if (!state.history.length) {
      thread.innerHTML = '<div class="chat-empty">Your conversation will appear here.</div>';
      return;
    }
    thread.innerHTML = state.history.map((message) => {
      const isStudent = message.role === "user";
      return `<div class="chat-message ${isStudent ? "chat-message--student" : "chat-message--persona"}">
        <span class="chat-label">${isStudent ? "You" : "Them"}</span>
        <p>${escapeHtml(message.content)}</p>
      </div>`;
    }).join("");
    thread.scrollTop = thread.scrollHeight;
  }

  function setGameBusy(busy) {
    state.waiting = busy;
    const container = getElement(state.options.gameContainer || "#screen-game");
    if (!container) return;
    container.querySelectorAll("button, textarea").forEach((element) => { element.disabled = busy; });
    const send = container.querySelector("[data-send]");
    if (send) send.textContent = busy ? "Thinking…" : state.maxTurns <= 1 ? "Add response" : "Send";
  }

  function setGameError(message) {
    const error = getElement(state.options.gameContainer || "#screen-game")?.querySelector("[data-game-error]");
    if (error) { error.textContent = message; error.hidden = !message; }
  }

  function updateTurnCounter() {
    const counter = getElement(state.options.gameContainer || "#screen-game")?.querySelector(".turn-counter");
    if (counter) counter.textContent = state.maxTurns <= 1 ? "One response" : `Turn ${state.turn} of ${state.maxTurns}`;
  }

  function readInput() {
    return getElement(state.options.gameContainer || "#screen-game")?.querySelector("[data-game-input]");
  }

  function appendStudentMessage() {
    const input = readInput();
    const content = input?.value.trim();
    if (!content) return null;
    state.history.push({ role: "user", content });
    input.value = "";
    renderHistory();
    return content;
  }

  async function sendTurn(event) {
    event?.preventDefault();
    if (state.waiting) return;
    const content = appendStudentMessage();
    if (!content) return setGameError("Write a response before sending it.");
    setGameError("");
    if (state.maxTurns <= 1) return scoreGame();
    if (state.turn >= state.maxTurns) return setGameError("You have used all available turns. Finish to see your feedback.");
    setGameBusy(true);
    try {
      const result = await requestJson(`/api/games/${encodeURIComponent(state.game)}/turn`, { history: state.history, context: state.context });
      const response = result.reply || result.message || result.response || result.content;
      if (!response) throw new Error("The game returned an empty response.");
      state.history.push({ role: "assistant", content: response });
      state.turn += 1;
      renderHistory();
      updateTurnCounter();
      if (state.turn >= state.maxTurns) {
        const send = getElement(state.options.gameContainer || "#screen-game")?.querySelector("[data-send]");
        if (send) send.disabled = true;
      }
    } catch (error) {
      state.history.pop();
      renderHistory();
      setGameError(error.message || "We could not continue the game. Try again.");
    } finally {
      setGameBusy(false);
    }
  }

  async function scoreGame(event) {
    event?.preventDefault();
    if (state.waiting) return;
    if (!state.history.some((message) => message.role === "user")) return setGameError("Add one response before asking for feedback.");
    setGameError("");
    setGameBusy(true);
    try {
      const result = await requestJson(`/api/games/${encodeURIComponent(state.game)}/score`, { history: state.history, context: state.context });
      renderScore(result || {});
      root.dispatchEvent(new CustomEvent("networking-buddy:state-changed", { detail: result }));
      setStatus("Feedback ready", "success");
    } catch (error) {
      setGameError(error.message || "We could not score this practice session.");
    } finally {
      setGameBusy(false);
    }
  }

  function renderScore(result) {
    const gameContainer = containerFor("gameContainer", "#screen-game");
    const scoreContainer = containerFor("scoreContainer", "#screen-score");
    if (!scoreContainer) return;
    show(gameContainer, false);
    show(scoreContainer, true);
    const scores = result.scores || {};
    const recommendedFollowUp = result.recommended_follow_up || result.follow_up_question || result.next_question;
    const bars = Object.entries(scores).map(([label, score]) => {
      const safeScore = Math.max(0, Math.min(5, Number(score) || 0));
      return `<div class="score-row"><div class="score-row-heading"><strong>${escapeHtml(label.replaceAll("_", " "))}</strong><span>${safeScore}/5</span></div><div class="score-bar"><span style="width:${safeScore * 20}%"></span></div></div>`;
    }).join("");
    scoreContainer.innerHTML = `
      <div class="score-header"><p class="eyebrow">Session complete</p><h1>Good work showing up.</h1><p class="lede">Keep the useful part, then try the one adjustment below in your next conversation.</p></div>
      <div class="xp-earned"><span>+${escapeHtml(result.xp ?? GAME_CONFIGS[state.game]?.xp ?? 0)} XP</span><small>Progress beats perfection.</small></div>
      <div class="score-card"><h2>Your score</h2>${bars || "<p>No rubric scores were returned.</p>"}</div>
      <div class="feedback-grid">
        <article class="feedback-card feedback-card--positive"><p class="eyebrow">Best moment</p><p>${escapeHtml(result.best_moment || "You completed the practice and created a chance to improve.")}</p></article>
        <article class="feedback-card"><p class="eyebrow">One fix</p><p>${escapeHtml(result.one_fix || "Make your next question more specific to the person you are speaking with.")}</p></article>
        <article class="feedback-card feedback-card--example"><p class="eyebrow">Try this version</p><p>${escapeHtml(result.rewrite_example || "Connect your question to something the other person actually mentioned.")}</p></article>
        ${recommendedFollowUp ? `<article class="feedback-card feedback-card--question"><p class="eyebrow">A thoughtful next question</p><p>${escapeHtml(recommendedFollowUp)}</p></article>` : ""}
      </div>
      <div class="score-actions"><button class="button button-secondary" type="button" data-retry>Try again</button><button class="button button-primary" type="button" data-home>Back to home</button></div>`;
    scoreContainer.querySelector("[data-retry]").addEventListener("click", () => renderGame(state.game, state.options));
    scoreContainer.querySelector("[data-home]").addEventListener("click", goHome);
  }

  function goHome() {
    if (typeof state.options.onHome === "function") return state.options.onHome();
    if (root.location) root.location.hash = "#/home";
  }

  function bindGameEvents() {
    const container = getElement(state.options.gameContainer || "#screen-game");
    const form = container?.querySelector("[data-game-form]");
    const finish = container?.querySelector("[data-finish]");
    const input = container?.querySelector("[data-game-input]");
    form?.addEventListener("submit", sendTurn);
    finish?.addEventListener("click", scoreGame);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); form?.requestSubmit(); }
    });
  }

  async function renderGame(gameName, options) {
    state.game = gameName;
    state.options = options || {};
    state.history = [];
    state.turn = 0;
    state.waiting = true;
    state.context = {};
    const config = GAME_CONFIGS[gameName] || { title: gameName, maxTurns: 1 };
    state.title = config.title;
    state.maxTurns = config.maxTurns;
    const gameContainer = containerFor("gameContainer", "#screen-game");
    if (gameContainer) gameContainer.innerHTML = '<div class="loading-state">Starting your practice…</div>';
    show(gameContainer, true);
    show(containerFor("scoreContainer", "#screen-score"), false);
    setStatus("", "");
    try {
      state.context = await loadGameContext();
      const result = await requestJson(`/api/games/${encodeURIComponent(gameName)}/start`, { context: state.context });
      state.title = result.title || config.title;
      state.goal = result.goal || "Practice one small networking skill.";
      state.maxTurns = Number(result.max_turns || config.maxTurns);
      const opening = result.opening_line || result.opening || result.message;
      if (opening) state.history.push({ role: "assistant", content: opening });
      renderShell();
      readInput()?.focus();
    } catch (error) {
      if (gameContainer) gameContainer.innerHTML = `<div class="error-state"><h2>Could not start the game</h2><p>${escapeHtml(error.message || "Try again.")}</p><button class="button button-primary" data-retry-game>Try again</button></div>`;
      gameContainer?.querySelector("[data-retry-game]")?.addEventListener("click", () => renderGame(gameName, state.options));
    } finally {
      state.waiting = false;
    }
  }

  function resetGame() {
    state.game = null;
    state.history = [];
    state.context = {};
    const gameContainer = containerFor("gameContainer", "#screen-game");
    const scoreContainer = containerFor("scoreContainer", "#screen-score");
    if (gameContainer) gameContainer.innerHTML = "";
    if (scoreContainer) scoreContainer.innerHTML = "";
  }

  Buddy.gameConfigs = GAME_CONFIGS;
  Buddy.renderGame = renderGame;
  Buddy.resetGame = resetGame;
  Buddy.escapeHtml = Buddy.escapeHtml || escapeHtml;
  root.renderGame = renderGame;
})(window);

