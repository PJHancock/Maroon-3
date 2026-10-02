(function (root) {
  "use strict";

  const Buddy = (root.NetworkingBuddy = root.NetworkingBuddy || {});
  const state = { taskId: null, task: null, options: {}, waiting: false };
  const TASK_META = {
    in_person: { label: "In person", icon: "✦", priority: 0 },
    event: { label: "Nearby event", icon: "⌁", priority: 1 },
    personal_chat: { label: "Personal chat", icon: "◌", priority: 2 },
    call: { label: "Make a call", icon: "☎", priority: 3 },
    online_outreach: { label: "Reach out online", icon: "↗", priority: 4 },
    follow_up: { label: "Follow up", icon: "↻", priority: 5 },
  };

  function api() {
    if (!Buddy.api) throw new Error("No Networking Buddy API adapter has been configured.");
    return Buddy.api;
  }

  function getElement(idOrElement) {
    if (!idOrElement) return null;
    if (typeof idOrElement !== "string") return idOrElement;
    return document.querySelector(idOrElement.startsWith("#") ? idOrElement : `#${idOrElement}`);
  }

  function escapeHtml(value) {
    if (Buddy.escapeHtml) return Buddy.escapeHtml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseResponse(response) {
    if (!response) return {};
    if (typeof response.json === "function") return response.json();
    return response;
  }

  function request(path, options) {
    return Promise.resolve().then(() => api()(path, options || {})).then(parseResponse);
  }

  function requestJson(path, body) {
    return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  function taskMeta(task) {
    return TASK_META[task.type] || { label: "Connection", icon: "✦", priority: 6 };
  }

  function difficultyLabel(task) {
    return String(task.difficulty || "medium").replace(/^./, (letter) => letter.toUpperCase());
  }

  function taskSort(a, b) {
    const aMeta = taskMeta(a);
    const bMeta = taskMeta(b);
    return (aMeta.priority - bMeta.priority) || (Number(b.xp || 0) - Number(a.xp || 0));
  }

  function renderTaskCard(task) {
    const meta = taskMeta(task);
    const inPerson = task.type === "in_person" || task.type === "event" || task.type === "personal_chat";
    return `<button class="daily-task-card ${inPerson ? "daily-task-card--priority" : ""}" data-daily-task="${escapeHtml(task.id)}">
      <span class="task-card-icon">${meta.icon}</span>
      <span class="daily-task-content"><span class="daily-task-topline"><span>${meta.label}</span><span>${escapeHtml(difficultyLabel(task))}</span></span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.description || "Make one useful connection and capture what happens next.")}</small><span class="daily-task-location">${escapeHtml(task.location || (inPerson ? "Real-world connection" : "Online connection"))}</span></span>
      <span class="daily-task-xp">+${escapeHtml(task.xp || 0)}<small>XP</small></span>
    </button>`;
  }

  async function renderDailyTasks(options) {
    const listOptions = options || {};
    const target = getElement(listOptions.listContainer || "#daily-tasks");
    if (!target) throw new Error("Missing daily task list container.");
    target.innerHTML = '<div class="loading-state loading-state--short">Loading today\'s connection plan…</div>';
    try {
      const data = await request("/api/state");
      const user = data.user || {};
      const tasks = (data.open_tasks || data.tasks || []).filter((task) => task.status !== "complete").sort(taskSort);
      const connectionDone = Boolean(user.today_connection_done);
      const nextTask = tasks[0];
      target.innerHTML = `
        <div class="daily-summary">
          <div><p class="eyebrow">Today</p><h2>${connectionDone ? "You made a connection today." : "Keep your connection streak alive."}</h2><p>${connectionDone ? "Nice work. You can keep going or leave the rest for tomorrow." : "One real-world action is enough to count today."}</p></div>
          <div class="streak-badge"><span>🔥</span><strong>${escapeHtml(user.streak || 0)}</strong><small>day streak</small></div>
        </div>
        <div class="daily-progress"><span class="daily-progress-label">${connectionDone ? "Daily connection complete" : "Daily connection goal"}</span><span>${connectionDone ? "1 / 1" : "0 / 1"}</span><div class="progress-track"><span style="width:${connectionDone ? 100 : 15}%"></span></div></div>
        ${nextTask ? `<div class="next-connection"><span class="next-connection-label">Best next move</span><strong>${escapeHtml(nextTask.title)}</strong><small>${escapeHtml(nextTask.xp || 0)} XP · ${escapeHtml(difficultyLabel(nextTask))} · ${escapeHtml(taskMeta(nextTask).label)}</small></div>` : ""}
        <div class="daily-task-list">${tasks.length ? tasks.map(renderTaskCard).join("") : '<div class="empty-task-state">Your connection plan is clear for today. Check back tomorrow for a new challenge.</div>'}</div>`;
      target.querySelectorAll("[data-daily-task]").forEach((button) => button.addEventListener("click", () => {
        const task = tasks.find((item) => item.id === button.dataset.dailyTask);
        if (!task) return;
        if (typeof listOptions.onSelect === "function") return listOptions.onSelect(task);
        renderTask(task.id, { ...listOptions, task });
      }));
    } catch (error) {
      target.innerHTML = `<div class="error-state"><h2>Could not load today's plan</h2><p>${escapeHtml(error.message || "Try again.")}</p><button class="button button-primary" data-retry-daily>Try again</button></div>`;
      target.querySelector("[data-retry-daily]")?.addEventListener("click", () => renderDailyTasks(listOptions));
    }
  }

  function container() { return getElement(state.options.taskContainer || "#screen-task"); }

  function setBusy(busy) {
    state.waiting = busy;
    container()?.querySelectorAll("button, input, textarea").forEach((element) => { element.disabled = busy; });
  }

  function showTaskError(message) {
    const error = container()?.querySelector("[data-task-error]");
    if (error) { error.textContent = message || ""; error.hidden = !message; }
  }

  function taskFromState(data, taskId) {
    const tasks = data.tasks || data.open_tasks || [];
    return tasks.find((task) => task.id === taskId) || null;
  }

  function renderForm() {
    const target = container();
    if (!target) throw new Error("Missing task screen container.");
    const task = state.task;
    const meta = taskMeta(task);
    const isExistingConnection = task.type === "in_person" || task.type === "event" || task.type === "personal_chat";
    const personPrompt = isExistingConnection ? "Who did you meet?" : "Who are you reaching out to?";
    const hookPrompt = isExistingConnection ? "What should you remember?" : "What is your reason to reconnect?";
    const hookHelp = isExistingConnection ? "Capture one specific hook for a future follow-up." : "A specific reason is more useful than a generic check-in.";
    const hookPlaceholder = isExistingConnection ? "e.g. Their team is moving to dbt next quarter." : "e.g. They shared a project I want to learn more about.";
    target.innerHTML = `
      <div class="screen-heading"><div><p class="eyebrow">${escapeHtml(meta.label)} · ${escapeHtml(difficultyLabel(task))}</p><h1>${escapeHtml(task.title)}</h1><p class="game-goal">${escapeHtml(task.description || "Capture one useful detail so you have a genuine reason to follow up.")}</p></div><div class="task-xp">${escapeHtml(task.xp || 0)} XP</div></div>
      <div class="reflection-intro"><span class="reflection-number">1</span><div><h2>${personPrompt}</h2><p>A name and a little context is enough to make this relationship memorable.</p></div></div>
      <form class="reflection-form" data-task-form>
        <label>Name<input name="met_name" autocomplete="off" placeholder="e.g. Marcus" required></label>
        <div class="field-grid"><label>Role<input name="role" autocomplete="off" placeholder="e.g. Data Engineer" required></label><label>Company or school<input name="company" autocomplete="organization" placeholder="e.g. Qualtrics" required></label></div>
        <div class="reflection-intro reflection-intro--second"><span class="reflection-number">2</span><div><h2>${hookPrompt}</h2><p>${hookHelp}</p></div></div>
        <label>Connection note<textarea name="hook" rows="4" placeholder="${hookPlaceholder}" required></textarea></label>
        <div class="task-error" data-task-error hidden></div>
        <button class="button button-primary" type="submit">Log connection and earn ${escapeHtml(task.xp || 0)} XP</button>
      </form>`;
    target.querySelector("[data-task-form]").addEventListener("submit", completeTask);
  }

  async function completeTask(event) {
    event.preventDefault();
    if (state.waiting) return;
    showTaskError("");
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    setBusy(true);
    try {
      const result = await requestJson(`/api/tasks/${encodeURIComponent(state.taskId)}/complete`, payload);
      renderSuccess(result);
      root.dispatchEvent(new CustomEvent("networking-buddy:state-changed", { detail: result }));
    } catch (error) {
      showTaskError(error.message || "We could not save this connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function renderSuccess(result) {
    const target = container();
    const contact = result.contact || {};
    const xp = result.xp_earned ?? result.xp ?? state.task.xp ?? 0;
    const isInPerson = state.task.type === "in_person" || state.task.type === "event" || state.task.type === "personal_chat";
    const successTitle = isInPerson ? "That detail is worth keeping." : "That outreach is now in motion.";
    const successCopy = isInPerson ? `You now have a genuine reason to follow up with ${escapeHtml(contact.name || "this person")} later.` : `You have made a specific connection move toward ${escapeHtml(contact.name || "this person")}.`;
    if (!target) return;
    target.innerHTML = `
      <div class="task-success"><div class="success-icon">✓</div><p class="eyebrow">Connection saved</p><h1>${successTitle}</h1><p class="lede">${successCopy}</p>
        <div class="contact-receipt"><strong>${escapeHtml(contact.name || "New contact")}</strong><span>${escapeHtml(contact.role || "")} · ${escapeHtml(contact.company || "")}</span><p>${escapeHtml((contact.notes || [])[0] || "Your conversation note is ready for the coach.")}</p></div>
        <div class="xp-earned"><span>+${escapeHtml(xp)} XP</span><small>${result.streak ? `Your streak is now ${escapeHtml(result.streak)} days.` : "Your networking habit is getting stronger."}</small></div>
        <div class="score-actions"><button class="button button-secondary" type="button" data-task-again>Complete another task</button><button class="button button-primary" type="button" data-task-home>Back to home</button></div>
      </div>`;
    target.querySelector("[data-task-home]")?.addEventListener("click", goHome);
    target.querySelector("[data-task-again]")?.addEventListener("click", () => renderTask(state.taskId, state.options));
  }

  function goHome() {
    if (typeof state.options.onHome === "function") return state.options.onHome();
    if (root.location) root.location.hash = "#/home";
  }

  async function renderTask(taskId, options) {
    state.taskId = taskId;
    state.options = options || {};
    state.waiting = true;
    const target = container();
    if (target) target.innerHTML = '<div class="loading-state">Opening your task…</div>';
    try {
      const providedTask = state.options.task;
      const data = providedTask ? { tasks: [providedTask] } : await request("/api/state");
      state.task = taskFromState(data, taskId) || providedTask;
      if (!state.task) throw new Error("That task could not be found.");
      renderForm();
    } catch (error) {
      if (target) target.innerHTML = `<div class="error-state"><h2>Could not open this task</h2><p>${escapeHtml(error.message || "Try again.")}</p><button class="button button-primary" data-retry-task>Try again</button></div>`;
      target?.querySelector("[data-retry-task]")?.addEventListener("click", () => renderTask(taskId, state.options));
    } finally {
      state.waiting = false;
    }
  }

  Buddy.renderTask = renderTask;
  Buddy.renderDailyTasks = renderDailyTasks;
  root.renderTask = renderTask;
  root.renderDailyTasks = renderDailyTasks;
})(window);
