// tasks_C.js — task types, plus the task screen: a two-question reflection that
// logs who you met, then a success screen. Home imports the task helpers from here.

import { registerScreen, getState, refreshState, post, esc, navigate, celebrate } from "./app_b.js";

// Real-world connections first, then online ones.
export const TASK_META = {
  in_person: { label: "In person", icon: "🤝", priority: 0, realWorld: true },
  event: { label: "Nearby event", icon: "📍", priority: 1, realWorld: true },
  personal_chat: { label: "Personal chat", icon: "☕", priority: 2, realWorld: true },
  call: { label: "Make a call", icon: "📞", priority: 3, realWorld: false },
  online_outreach: { label: "Reach out online", icon: "💬", priority: 4, realWorld: false },
  follow_up: { label: "Follow up", icon: "✉️", priority: 5, realWorld: false },
};
const OTHER_TASK = { label: "Connection", icon: "✅", priority: 6, realWorld: false };

export function taskMeta(task) {
  return TASK_META[task?.type] ?? OTHER_TASK;
}

export function difficultyLabel(task) {
  return String(task?.difficulty || "medium").replace(/^./, (c) => c.toUpperCase());
}

// Open tasks, sorted by type priority, then by XP (highest first).
export function openTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((t) => (t.status ?? "open") === "open")
    .sort((a, b) => taskMeta(a).priority - taskMeta(b).priority || (Number(b.xp) || 0) - (Number(a.xp) || 0));
}

// In-person tasks ask "who did you meet?"; online ones ask "who are you reaching out to?".
export function reflectionCopy(task) {
  return taskMeta(task).realWorld
    ? {
      person: "Who did you meet?",
      hook: "What should you remember?",
      hookHelp: "Capture one specific detail for a future follow-up.",
      hookPlaceholder: "e.g. Their team is moving to dbt next quarter.",
      successTitle: "That detail is worth keeping.",
      successCopy: (name) => `You now have a genuine reason to follow up with ${name} later.`,
    }
    : {
      person: "Who are you reaching out to?",
      hook: "What's your reason to reconnect?",
      hookHelp: "A specific reason works better than a generic check-in.",
      hookPlaceholder: "e.g. They shared a project I want to learn more about.",
      successTitle: "That outreach is now in motion.",
      successCopy: (name) => `You've made a specific move toward ${name}.`,
    };
}

// ---------- pure renderers ----------

export function renderTaskHeader(task) {
  const meta = taskMeta(task);
  return `
    <div class="screen-heading">
      <div>
        <p class="eyebrow">${esc(meta.label)} · ${esc(difficultyLabel(task))}</p>
        <h1>${esc(task.title)}</h1>
        ${task.description ? `<p class="muted">${esc(task.description)}</p>` : ""}
      </div>
      <span class="xp-pill">+${Number(task.xp) || 0} XP</span>
    </div>`;
}

export function renderReflectionForm(task) {
  const copy = reflectionCopy(task);
  const field = (name, label, attrs = "") => `
    <label class="field"><span>${label}</span><input name="${name}" autocomplete="off" ${attrs}></label>`;
  return `
    ${renderTaskHeader(task)}
    <form class="card reflection-form" novalidate>
      <div class="reflection-step"><span class="step-num">1</span><h2>${copy.person}</h2></div>
      ${field("met_name", "Name *", 'placeholder="e.g. Marcus"')}
      <div class="field-row">
        ${field("role", "Role *", 'placeholder="e.g. Data engineer"')}
        ${field("company", "Company or school *", 'placeholder="e.g. Qualtrics"')}
      </div>
      <div class="reflection-step"><span class="step-num">2</span><div><h2>${copy.hook}</h2><p class="muted">${copy.hookHelp}</p></div></div>
      <label class="field"><span>Connection note *</span>
        <textarea name="hook" rows="3" placeholder="${esc(copy.hookPlaceholder)}"></textarea></label>
      <div class="form-error" hidden></div>
      <button class="btn btn-block" type="submit">Log connection · +${Number(task.xp) || 0} XP</button>
    </form>`;
}

// Turns raw form values into the POST /api/tasks/{id}/complete body.
export function validateReflection(values) {
  const v = values ?? {};
  const payload = {
    met_name: String(v.met_name ?? "").trim(),
    role: String(v.role ?? "").trim(),
    company: String(v.company ?? "").trim(),
    hook: String(v.hook ?? "").trim(),
  };
  const errors = {};
  if (!payload.met_name) errors.met_name = "Add their name";
  if (!payload.role) errors.role = "Add their role";
  if (!payload.company) errors.company = "Add their company or school";
  if (!payload.hook) errors.hook = "Add one thing to remember";
  return { ok: Object.keys(errors).length === 0, errors, payload };
}

export function renderTaskSuccess(task, result) {
  const copy = reflectionCopy(task);
  const contact = result?.contact ?? {};
  const name = contact.name || "this person";
  const xp = Number(result?.xp_earned ?? result?.xp ?? task?.xp) || 0;
  const sub = [contact.role, contact.company].filter(Boolean).join(" · ");
  return `
    <div class="task-success">
      <div class="success-icon">✓</div>
      <p class="eyebrow">Connection saved</p>
      <h1>${copy.successTitle}</h1>
      <p class="muted">${esc(copy.successCopy(name))}</p>
      <div class="card contact-receipt">
        <strong>${esc(contact.name || "New contact")}</strong>
        ${sub ? `<small>${esc(sub)}</small>` : ""}
        ${contact.notes?.[0] ? `<p>${esc(contact.notes[0])}</p>` : ""}
      </div>
      <div class="xp-banner"><strong>+${xp} XP</strong>
        <span>${result?.user?.streak ? `Your streak is now ${Number(result.user.streak)} days.` : "Your networking habit is getting stronger."}</span></div>
      <div class="sheet-actions">
        <button class="btn btn-ghost" data-action="more-tasks">Pick another task</button>
        <button class="btn" data-action="home">Back to home</button>
      </div>
    </div>`;
}

export function renderTaskMissing(message) {
  return `
    <div class="error-box">${esc(message)}</div>
    <button class="btn btn-ghost" data-action="more-tasks">Back to tasks</button>`;
}

// ---------- screen ----------

function showErrors(form, errors) {
  form.querySelectorAll(".field-error").forEach((x) => x.remove());
  for (const [name, msg] of Object.entries(errors)) {
    form.querySelector(`[name=${name}]`).insertAdjacentHTML("afterend", `<em class="field-error">${esc(msg)}</em>`);
  }
}

function wireActions(el) {
  el.onclick = (e) => {
    if (e.target.closest("[data-action=more-tasks]")) navigate("#/home", { scrollTo: "tasks" });
    if (e.target.closest("[data-action=home]")) navigate("#/home");
  };
}

registerScreen("task", {
  async show({ id, el }) {
    wireActions(el);
    let state = getState();
    let task = state?.tasks?.find((t) => t.id === id);
    if (!task) {
      el.innerHTML = `<div class="loading">Opening your task…</div>`;
      state = await refreshState();
      task = state.tasks.find((t) => t.id === id);
    }
    if (!task) return (el.innerHTML = renderTaskMissing("That task could not be found."));
    if ((task.status ?? "open") !== "open") return (el.innerHTML = renderTaskMissing("You already finished this task."));

    el.innerHTML = renderReflectionForm(task);
    const form = el.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { ok, errors, payload } = validateReflection(Object.fromEntries(new FormData(form)));
      showErrors(form, errors);
      if (!ok) return;
      const btn = form.querySelector("button[type=submit]");
      const error = form.querySelector(".form-error");
      btn.disabled = true;
      btn.textContent = "Saving…";
      error.hidden = true;
      try {
        const result = await post(`/api/tasks/${encodeURIComponent(task.id)}/complete`, payload);
        el.innerHTML = renderTaskSuccess(task, result);
        celebrate(Number(result?.xp_awarded ?? result?.xp_earned) || 0);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = `Log connection · +${Number(task.xp) || 0} XP`;
        error.textContent = `Couldn't save this connection: ${err.message}`;
        error.hidden = false;
      }
    });
  },
});
