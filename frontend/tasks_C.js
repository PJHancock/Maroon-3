// tasks_C.js — task types, plus the task screen: a two-question reflection that
// logs who you met, then a success screen. Home imports the task helpers from here.

import { registerScreen, getState, refreshState, post, api, esc, navigate, celebrate, copyText, toast } from "./app_b.js";

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

const FALLBACK_GUIDANCE = {
  in_person: {
    objective: "Have one genuine conversation and leave with one specific detail to remember.",
    steps: ["Choose a place where your target community gathers.", "Introduce yourself with a clear reason for being there.", "Ask one open question and listen for a detail.", "Name a low-pressure next step before leaving."],
    questions: ["What kind of work has your attention lately?", "How did you get into this field?", "What would you recommend I try next?"],
    script: "",
    external_hint: "Find a current campus, meetup, or professional event nearby.",
  },
  event: {
    objective: "Attend a relevant event and have one conversation with someone whose work interests you.",
    steps: ["Pick an event that fits your role interests and schedule.", "Prepare one specific question.", "Arrive early enough to introduce yourself.", "Write down one detail before you leave."],
    questions: ["What brought you to this event?", "What problem is your team working on?", "What skill helps someone contribute quickly?"],
    script: "",
    external_hint: "Find a current campus, meetup, or professional event within the next 90 days.",
  },
  personal_chat: {
    objective: "Set up a short conversation that creates a natural next step.",
    steps: ["Choose someone connected to your current goal.", "Invite them to a specific 15-minute window.", "Bring two questions and follow their answers.", "End by naming what you learned."],
    questions: ["What does a normal week look like?", "What helped you get started?", "What small project would you recommend?"],
    script: "Would you be open to a 15-minute chat next week? I’d love to ask about your path into this work.",
    external_hint: "Use a contact you already know or search a relevant community.",
  },
  call: {
    objective: "Make a real call with a clear reason for reconnecting and a small next step.",
    steps: ["Choose a contact with a genuine reason to call.", "Ask whether they have a minute.", "Ask one focused question.", "If they miss it, leave the reason and an easy reply path."],
    questions: ["What has changed since we last talked?", "Could I ask one quick question about your experience?"],
    script: "Hi, it’s [your name]. I was thinking about what you shared about [specific detail]. I had one quick question and would love to reconnect when you have a minute.",
    external_hint: "Choose a contact with a phone number to make this one tap away.",
  },
  online_outreach: {
    objective: "Send one specific, low-pressure message to someone whose work you want to understand.",
    steps: ["Choose someone connected to your target role.", "Read enough to reference one project or idea.", "Ask one focused question.", "Make the next step optional and easy to decline."],
    questions: ["What part of your work has been most interesting recently?", "What would you suggest a student build?"],
    script: "Hi! I’m a student exploring [role]. Your work on [specific project] caught my attention. Could I ask one quick question about how you got started?",
    external_hint: "Use personalized people results or search LinkedIn for a role and location.",
  },
  follow_up: {
    objective: "Reconnect using something the person actually shared instead of a generic check-in.",
    steps: ["Choose the person and reread your notes.", "Lead with the specific detail you remember.", "Share a small update, question, or resource.", "End with a low-pressure next step."],
    questions: ["How did the project or deadline turn out?", "Would it be useful if I sent the small project I mentioned?"],
    script: "Hi! I was thinking about what you shared about [specific detail]. I wanted to ask how it turned out and share a quick update.",
    external_hint: "Use the person’s saved notes to make the reason for reconnecting specific.",
  },
};

export function fallbackGuidance(task) {
  return FALLBACK_GUIDANCE[task?.type] ?? FALLBACK_GUIDANCE.in_person;
}

export function linkedinSearchUrl(user = {}, task = {}) {
  const role = user.target_roles?.[0] || user.major || "professional networking";
  const location = user.location || user.school || "near me";
  const query = `${role} ${location}`.trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=GLOBAL_SEARCH_HEADER`;
}

function telHref(phone) {
  const value = String(phone ?? "").trim();
  return `tel:${value.startsWith("+") ? "+" : ""}${value.replace(/\D/g, "")}`;
}

export function eventToICS(item) {
  if (!item?.starts_at) return "";
  const toICSDate = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  };
  const start = toICSDate(item.starts_at);
  const end = toICSDate(item.ends_at) || toICSDate(new Date(new Date(item.starts_at).getTime() + 3600000));
  if (!start || !end) return "";
  const fold = (value) => String(value ?? "").replace(/[\\;,\n]/g, (c) => `\\${c}`);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Networking Buddy//EN", "BEGIN:VEVENT",
    `UID:${item.id}@networking-buddy`, `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${fold(item.title)}`,
    `DESCRIPTION:${fold(item.summary)}\\n\\n${fold(item.why_it_fits)}`,
    `LOCATION:${fold(item.location)}`, `URL:${item.action_url}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

// ---------- pure renderers ----------

export function renderTaskHeader(task) {
  const meta = taskMeta(task);
  return `
    <div class="screen-heading">
      <div>
        <p class="eyebrow">${esc(meta.label)} · ${esc(difficultyLabel(task))}${task.frequency && task.frequency !== "once" ? ` · ${task.frequency}` : ""}${task.skill ? ` · ${esc(task.skill)}` : ""}</p>
        <h1>${esc(task.title)}</h1>
        ${task.description ? `<p class="muted">${esc(task.description)}</p>` : ""}
      </div>
      <span class="xp-pill">+${Number(task.xp) || 0} XP</span>
    </div>`;
}

function contactOptions(contacts, selectedId = "", phoneOnly = false) {
  return (Array.isArray(contacts) ? contacts : [])
    .filter((contact) => !phoneOnly || contact.phone)
    .slice().sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
    .map((contact) => `<option value="${esc(contact.id)}" ${contact.id === selectedId ? "selected" : ""}>${esc(contact.name)}${contact.company ? ` · ${esc(contact.company)}` : ""}${phoneOnly ? ` · ${esc(contact.phone)}` : ""}</option>`)
    .join("");
}

function renderContactActions(contact) {
  if (!contact) return `<p class="muted prep-empty">Choose a contact to see direct actions.</p>`;
  const actions = [];
  if (contact.phone) actions.push(`<a class="btn btn-small" href="${esc(telHref(contact.phone))}">📞 Call ${esc(contact.name)}</a>`);
  if (contact.email) actions.push(`<a class="btn btn-small btn-ghost" href="mailto:${esc(contact.email)}">✉️ Email</a>`);
  return actions.length ? `<div class="prep-actions">${actions.join("")}</div>` : `<p class="muted prep-empty">This contact has no phone or email saved yet.</p>`;
}

export function renderOpportunityCard(item, selectedId = "") {
  const selected = item?.id === selectedId;
  const event = item?.kind === "event";
  const calendar = event && item.starts_at
    ? `<a class="btn btn-small btn-ghost" href="data:text/calendar;charset=utf-8,${encodeURIComponent(eventToICS(item))}" download="${esc(item.id)}.ics">Add calendar</a>` : "";
  return `<article class="card prep-opportunity ${selected ? "prep-opportunity--selected" : ""}">
    <div class="prep-opportunity-head"><span class="eyebrow">${event ? "Upcoming event" : "Person or community"}</span>${selected ? `<span class="radar-badge">Attached</span>` : ""}</div>
    <h3>${esc(item.title)}</h3>
    ${item.starts_at ? `<p class="research-date">📅 ${esc(new Date(item.starts_at).toLocaleString())}</p>` : ""}
    ${item.location ? `<p class="research-location">📍 ${esc(item.location)}</p>` : ""}
    <p>${esc(item.summary)}</p><p class="research-fit">${esc(item.why_it_fits)}</p>
    <small class="research-source">Source: <a href="${esc(item.source_url)}" target="_blank" rel="noopener">${esc(item.source_name)}</a></small>
    <div class="prep-actions">
      <a class="btn btn-small" href="${esc(item.action_url)}" target="_blank" rel="noopener">${event ? "Details / RSVP" : "Explore"}</a>
      ${calendar}
      <button class="btn btn-small btn-ghost" data-action="use-opportunity" data-opportunity-id="${esc(item.id)}">${selected ? "Attached" : "Use for this task"}</button>
    </div>
  </article>`;
}

export function renderTaskPrep(task, contacts = [], opportunities = [], options = {}) {
  const guidance = options.guidance ?? fallbackGuidance(task);
  const selectedContactId = options.selectedContactId ?? task?.contact_id ?? "";
  const selectedContact = contacts.find((contact) => contact.id === selectedContactId);
  const selectedOpportunityId = task?.prep_context?.opportunity_id ?? "";
  const needsResearch = ["in_person", "event", "online_outreach"].includes(task?.type);
  const user = options.user ?? {};
  const externalLink = task?.type === "online_outreach"
    ? `<a class="btn btn-small btn-ghost" href="${esc(linkedinSearchUrl(user, task))}" target="_blank" rel="noopener">Search LinkedIn</a>` : "";
  const researchButton = needsResearch && !options.researchLoaded
    ? `<button class="btn btn-small btn-ghost" data-action="load-research">${task.type === "online_outreach" ? "Find people to explore" : "Find nearby events"}</button>` : "";
  const opportunitiesMarkup = options.researchLoaded
    ? (opportunities.length
      ? `<div class="prep-opportunity-list">${opportunities.map((item) => renderOpportunityCard(item, selectedOpportunityId)).join("")}</div>`
      : `<div class="empty">No live matches right now. Use the built-in plan and try again later.</div>`)
    : `<p class="muted">${esc(guidance.external_hint || "Use the checklist below to make the next step concrete.")}</p>`;
  const showPhoneOnly = task?.type === "call";
  return `<div class="task-prep">
    ${renderTaskHeader(task)}
    <section class="prep-hero"><p class="eyebrow">Before you report it</p><h2>${esc(guidance.objective)}</h2><p class="muted">Take one concrete action, then capture what made the connection real.</p></section>
    <section class="card prep-section"><div class="prep-section-heading"><h2>Make it happen</h2><span class="prep-badge">${esc(difficultyLabel(task))} · ${Number(task.xp) || 0} XP</span></div><ol class="prep-steps">${guidance.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></section>
    <section class="card prep-section"><div class="prep-section-heading"><h2>Use a question</h2></div><ul class="prep-questions">${guidance.questions.map((question) => `<li>${esc(question)}</li>`).join("")}</ul>${guidance.script ? `<div class="prep-script"><strong>Starter script</strong><p>${esc(guidance.script)}</p><button class="btn btn-small btn-ghost" data-action="copy-script">Copy script</button></div>` : ""}</section>
    <section class="card prep-section"><div class="prep-section-heading"><h2>${showPhoneOnly ? "Who will you call?" : "Connect this action to someone"}</h2><span class="prep-badge">Optional</span></div><select class="prep-contact-select" name="prep_contact_id"><option value="">Choose a contact</option>${contactOptions(contacts, selectedContactId, showPhoneOnly)}</select>${selectedContact ? `<div class="prep-contact-summary"><strong>${esc(selectedContact.name)}</strong><span>${esc([selectedContact.role, selectedContact.company].filter(Boolean).join(" · "))}</span>${selectedContact.notes?.[0] ? `<small>Remember: ${esc(selectedContact.notes[0])}</small>` : ""}</div>` : ""}${renderContactActions(selectedContact)}</section>
    ${needsResearch ? `<section class="card prep-section"><div class="prep-section-heading"><div><h2>${task.type === "online_outreach" ? "Find someone relevant" : "Find somewhere to connect"}</h2><p class="muted">${esc(guidance.external_hint || "Personalized results are optional; the checklist always works.")}</p></div><span class="prep-badge">${options.researchLoaded ? "Research" : "Optional"}</span></div><div class="prep-actions">${researchButton}${externalLink}</div>${opportunitiesMarkup}</section>` : ""}
    ${task?.prep_context ? `<section class="prep-attached"><strong>Attached context</strong><span>${esc(task.prep_context.title)}${task.prep_context.location ? ` · ${esc(task.prep_context.location)}` : ""}</span><button class="btn btn-small btn-ghost" data-action="clear-opportunity">Clear</button></section>` : ""}
    <button class="btn btn-block prep-report" data-action="report-task">I did it — report connection</button>
    <button class="harness-back" data-action="more-tasks">← Back to today’s plan</button>
  </div>`;
}

export function renderReflectionForm(task, contacts = [], selectedContactId = "") {
  const copy = reflectionCopy(task);
  const field = (name, label, attrs = "") => `
    <label class="field"><span>${label}</span><input name="${name}" autocomplete="off" ${attrs}></label>`;
  const selectedContact = (Array.isArray(contacts) ? contacts : [])
    .find((contact) => contact.id === (selectedContactId || task.contact_id));
  const options = (Array.isArray(contacts) ? contacts : [])
    .slice().sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
    .map((contact) => `<option value="${esc(contact.id)}" ${contact.id === (selectedContactId || task.contact_id) ? "selected" : ""}>${esc(contact.name)}${contact.company ? ` · ${esc(contact.company)}` : ""}</option>`)
    .join("");
  return `
    ${renderTaskHeader(task)}
    ${task.prep_context ? `<div class="prep-attached"><strong>Prepared with</strong><span>${esc(task.prep_context.title)}${task.prep_context.location ? ` · ${esc(task.prep_context.location)}` : ""}</span></div>` : ""}
    <button class="harness-back" type="button" data-action="back-to-prep">← Back to preparation</button>
    <form class="card reflection-form" novalidate>
      <div class="reflection-step"><span class="step-num">1</span><h2>${copy.person}</h2></div>
      <label class="field"><span>Update an existing contact</span>
        <select name="contact_id"><option value="">Create a new contact</option>${options}</select></label>
      ${field("met_name", "Name *", `placeholder="e.g. Marcus" value="${esc(selectedContact?.name ?? (task.prep_context?.kind === "person" ? task.prep_context.title : ""))}"`)}
      <div class="field-row">
        ${field("role", "Role", `placeholder="e.g. Data engineer" value="${esc(selectedContact?.role ?? "")}"`)}
        ${field("company", "Company or school", `placeholder="e.g. Qualtrics" value="${esc(selectedContact?.company ?? "")}"`)}
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
    contact_id: String(v.contact_id ?? "").trim(),
  };
  const errors = {};
  if (!payload.met_name) errors.met_name = "Add their name";
  if (!payload.contact_id && !payload.role) errors.role = "Add their role, or choose an existing contact";
  if (!payload.contact_id && !payload.company) errors.company = "Add their company or school, or choose an existing contact";
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

function wireGlobalActions(el) {
  el.onclick = (e) => {
    if (e.target.closest("[data-action=more-tasks]")) navigate("#/home", { scrollTo: "tasks" });
    if (e.target.closest("[data-action=home]")) navigate("#/home");
  };
}

function attachReportForm(el, task, state, selectedContactId, showPrep) {
  el.innerHTML = renderReflectionForm(task, state.contacts, selectedContactId);
  wireGlobalActions(el);
  el.querySelector("[data-action=back-to-prep]").addEventListener("click", showPrep);
  const form = el.querySelector("form");
  const contactSelect = form.querySelector("select[name=contact_id]");
  const contactFields = ["met_name", "role", "company"];
  const syncSelectedContact = () => {
    const contact = state.contacts.find((item) => item.id === contactSelect.value);
    if (!contact) return;
    for (const name of contactFields) {
      const input = form.querySelector(`[name=${name}]`);
      if (input && (!input.value.trim() || name === "met_name")) input.value = contact[name] ?? "";
    }
  };
  contactSelect.addEventListener("change", syncSelectedContact);
  if (contactSelect.value) syncSelectedContact();
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
      wireGlobalActions(el);
      celebrate(Number(result?.xp_awarded ?? result?.xp_earned) || 0);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `Log connection · +${Number(task.xp) || 0} XP`;
      error.textContent = `Couldn't save this connection: ${err.message}`;
      error.hidden = false;
    }
  });
}

registerScreen("task", {
  async show({ id, el }) {
    let state = getState();
    let task = state?.tasks?.find((t) => t.id === id);
    if (!task) {
      el.innerHTML = `<div class="loading">Opening your task…</div>`;
      state = await refreshState();
      task = state.tasks.find((t) => t.id === id);
    }
    if (!task) return (el.innerHTML = renderTaskMissing("That task could not be found."));
    if ((task.status ?? "open") !== "open") return (el.innerHTML = renderTaskMissing("You already finished this task."));

    let guidance = fallbackGuidance(task);
    let selectedContactId = task.contact_id ?? "";
    let opportunities = [];
    let researchLoaded = false;
    try {
      const prep = await api(`/api/tasks/${encodeURIComponent(id)}/prep`);
      task = prep.task ?? task;
      guidance = prep.guidance ?? guidance;
      state = { ...state, contacts: prep.contacts ?? state.contacts };
      selectedContactId = task.contact_id ?? selectedContactId;
    } catch (err) {
      toast(`Using built-in guidance: ${err.message}`);
    }

    const showPrep = () => {
      el.innerHTML = renderTaskPrep(task, state.contacts, opportunities, {
        guidance, researchLoaded, selectedContactId, user: state.user,
      });
      wireGlobalActions(el);
      const contactSelect = el.querySelector("select[name=prep_contact_id]");
      if (contactSelect) contactSelect.addEventListener("change", () => {
        selectedContactId = contactSelect.value;
        showPrep();
      });
      const copyButton = el.querySelector("[data-action=copy-script]");
      if (copyButton) copyButton.addEventListener("click", async () => {
        const ok = await copyText(guidance.script);
        toast(ok ? "Script copied" : "Select the script and copy it");
      });
      const researchButton = el.querySelector("[data-action=load-research]");
      if (researchButton) researchButton.addEventListener("click", async () => {
        researchButton.disabled = true;
        researchButton.textContent = "Searching…";
        try {
          const response = await api("/api/opportunities");
          const wanted = task.type === "online_outreach" ? "person" : "event";
          opportunities = (response?.opportunities ?? []).filter((item) => item.kind === wanted);
          researchLoaded = true;
          showPrep();
        } catch (err) {
          researchButton.disabled = false;
          researchButton.textContent = "Try research again";
          toast(`Research unavailable: ${err.message}`);
        }
      });
      el.querySelectorAll("[data-action=use-opportunity]").forEach((button) => {
        button.addEventListener("click", async () => {
          const opportunity = opportunities.find((item) => item.id === button.dataset.opportunityId);
          if (!opportunity) return;
          button.disabled = true;
          try {
            const context = await post(`/api/tasks/${encodeURIComponent(task.id)}/context`, {
              opportunity_id: opportunity.id,
              kind: opportunity.kind,
              title: opportunity.title,
              summary: opportunity.summary,
              why_it_fits: opportunity.why_it_fits,
              source_name: opportunity.source_name,
              source_url: opportunity.source_url,
              action_url: opportunity.action_url,
              starts_at: opportunity.starts_at ?? null,
              ends_at: opportunity.ends_at ?? null,
              location: opportunity.location ?? "",
              tags: opportunity.tags ?? [],
            });
            task = { ...task, prep_context: context };
            showPrep();
            toast("Attached to this task");
          } catch (err) {
            button.disabled = false;
            toast(`Couldn't attach this result: ${err.message}`);
          }
        });
      });
      const clearButton = el.querySelector("[data-action=clear-opportunity]");
      if (clearButton) clearButton.addEventListener("click", async () => {
        clearButton.disabled = true;
        try {
          task = await api(`/api/tasks/${encodeURIComponent(task.id)}/context`, { method: "DELETE" });
          showPrep();
        } catch (err) {
          clearButton.disabled = false;
          toast(`Couldn't clear the attached result: ${err.message}`);
        }
      });
      const reportButton = el.querySelector("[data-action=report-task]");
      if (reportButton) reportButton.addEventListener("click", () => attachReportForm(el, task, state, selectedContactId, showPrep));
    };

    showPrep();
  },
});
