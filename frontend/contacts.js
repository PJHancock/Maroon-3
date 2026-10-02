// contacts.js — contact log + add-contact form.
// Owner: Teammate B. Render and validation functions are pure and unit-tested.

import { registerScreen, getState, refreshState, post, esc, daysSince, toast } from "./app.js";

export function lastContactLabel(isoDate, today) {
  const d = daysSince(isoDate, today);
  if (d === null) return "";
  if (d <= 0) return "Talked today";
  if (d === 1) return "Talked yesterday";
  return `Talked ${d} days ago`;
}

// Most recently contacted first; contacts with no date go last.
export function sortContacts(contacts) {
  return [...(Array.isArray(contacts) ? contacts : [])].sort((a, b) =>
    String(b.last_contact ?? "").localeCompare(String(a.last_contact ?? "")));
}

export function renderContact(c, today) {
  const notes = Array.isArray(c.notes) ? c.notes : c.notes ? [String(c.notes)] : [];
  const sub = [c.role, c.company].filter(Boolean).join(" · ");
  const when = lastContactLabel(c.last_contact, today);
  return `
    <article class="card contact-card" data-contact-id="${esc(c.id)}">
      <div class="coach-who"><span class="avatar">${esc((c.name ?? "?")[0] ?? "?")}</span>
        <span><strong>${esc(c.name ?? "Unnamed")}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span></div>
      ${c.how_met ? `<p class="muted">Met: ${esc(c.how_met)}</p>` : ""}
      ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      ${when ? `<p class="when">${esc(when)}</p>` : ""}
    </article>`;
}

export function renderContactList(contacts, today) {
  const list = sortContacts(contacts);
  if (!list.length) return `<div class="empty">No contacts yet. Complete a task or add someone you've met.</div>`;
  return list.map((c) => renderContact(c, today)).join("");
}

export function renderContactForm(errors = {}) {
  const field = (name, label, attrs = "") => `
    <label class="field"><span>${label}</span>
      <input name="${name}" ${attrs}>
      ${errors[name] ? `<em class="field-error">${esc(errors[name])}</em>` : ""}</label>`;
  return `
    <form class="card contact-form" novalidate>
      <h2>Add a contact</h2>
      ${field("name", "Name *", 'autocomplete="off" required')}
      ${field("how_met", "How you met", 'placeholder="Career fair, class, a friend…"')}
      ${field("company", "Company")}
      ${field("role", "Role")}
      <label class="field"><span>Notes (one per line)</span>
        <textarea name="notes" rows="3" placeholder="What did you talk about?"></textarea></label>
      <div class="sheet-actions">
        <button class="btn" type="submit">Save contact</button>
        <button class="btn btn-ghost" type="button" data-action="cancel-add">Cancel</button>
      </div>
    </form>`;
}

// Turns raw form values into the POST /api/contacts body.
export function validateContactForm(values) {
  const v = values ?? {};
  const clean = (x) => String(x ?? "").trim();
  const payload = {
    name: clean(v.name),
    how_met: clean(v.how_met),
    company: clean(v.company),
    role: clean(v.role),
    notes: String(v.notes ?? "").split("\n").map((n) => n.trim()).filter(Boolean),
  };
  const errors = {};
  if (!payload.name) errors.name = "Add their name";
  return { ok: Object.keys(errors).length === 0, errors, payload };
}

export function renderContactsScreen(contacts, today) {
  return `
    <div class="block-head"><h1>Contacts</h1>
      <button class="btn btn-small" data-action="add-contact">+ Add</button></div>
    <div id="contact-form-slot"></div>
    <div id="contact-list">${renderContactList(contacts, today)}</div>`;
}

function showForm(el) {
  const slot = el.querySelector("#contact-form-slot");
  slot.innerHTML = renderContactForm();
  const form = slot.querySelector("form");
  form.querySelector("input[name=name]").focus();
  form.querySelector("[data-action=cancel-add]").addEventListener("click", () => (slot.innerHTML = ""));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { ok, errors, payload } = validateContactForm(Object.fromEntries(new FormData(form)));
    form.querySelectorAll(".field-error").forEach((x) => x.remove());
    if (!ok) {
      for (const [name, msg] of Object.entries(errors)) {
        form.querySelector(`[name=${name}]`).insertAdjacentHTML("afterend", `<em class="field-error">${esc(msg)}</em>`);
      }
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await post("/api/contacts", payload);
      const state = await refreshState();
      slot.innerHTML = "";
      el.querySelector("#contact-list").innerHTML = renderContactList(state.contacts);
      toast(`Added ${payload.name}`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Save contact";
      toast(`Couldn't save: ${err.message}`);
    }
  });
}

registerScreen("contacts", {
  async show({ el }) {
    let state;
    try {
      state = await refreshState();
    } catch (err) {
      state = getState();
      if (!state) throw err;
    }
    el.innerHTML = renderContactsScreen(state.contacts);
    el.onclick = (e) => {
      if (e.target.closest("[data-action=add-contact]")) showForm(el);
    };
  },
});
