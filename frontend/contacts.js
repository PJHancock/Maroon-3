// contacts.js — contact log with search and an add-contact form.
// Render, search, and validation functions are pure and unit-tested.

import { registerScreen, getState, refreshState, post, esc, daysSince, todayISO, toast } from "./app.js";

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

// Every word in the query must appear somewhere in the contact.
export function filterContacts(contacts, query) {
  const list = Array.isArray(contacts) ? contacts : [];
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((c) => {
    const notes = Array.isArray(c.notes) ? c.notes : [c.notes];
    const hay = [c.name, c.company, c.role, c.how_met, c.email, c.phone, ...notes]
      .filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// Loose checks: catch typos, not every edge case.
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ""));
}

// Digits plus common separators; 7–15 digits total.
export function isValidPhone(phone) {
  const s = String(phone ?? "");
  const digits = s.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(s) && digits.length >= 7 && digits.length <= 15;
}

// "(801) 555-0123" -> "tel:8015550123"; keeps a leading +.
export function telHref(phone) {
  const s = String(phone ?? "").trim();
  return `tel:${s.startsWith("+") ? "+" : ""}${s.replace(/\D/g, "")}`;
}

export function renderContact(c, today) {
  const notes = Array.isArray(c.notes) ? c.notes : c.notes ? [String(c.notes)] : [];
  const sub = [c.role, c.company].filter(Boolean).join(" · ");
  const when = lastContactLabel(c.last_contact, today);
  const links = [
    c.phone ? `<a href="${esc(telHref(c.phone))}">📞 ${esc(c.phone)}</a>` : "",
    c.email ? `<a href="mailto:${esc(c.email)}">✉️ ${esc(c.email)}</a>` : "",
  ].filter(Boolean).join("");
  return `
    <article class="card contact-card" data-contact-id="${esc(c.id)}">
      <div class="coach-who"><span class="avatar">${esc((c.name ?? "?")[0] ?? "?")}</span>
        <span><strong>${esc(c.name ?? "Unnamed")}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span></div>
      ${c.how_met ? `<p class="muted">Met: ${esc(c.how_met)}</p>` : ""}
      ${links ? `<div class="contact-links">${links}</div>` : ""}
      ${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      ${when ? `<p class="when">${esc(when)}</p>` : ""}
    </article>`;
}

export function renderContactList(contacts, today, query = "") {
  const all = Array.isArray(contacts) ? contacts : [];
  if (!all.length) return `<div class="empty">No contacts yet. Complete a task or add someone you've met.</div>`;
  const list = sortContacts(filterContacts(all, query));
  if (!list.length) return `<div class="empty">No contacts match "${esc(query)}".</div>`;
  return list.map((c) => renderContact(c, today)).join("");
}

export function renderContactForm(today = todayISO()) {
  const field = (name, label, attrs = "") => `
    <label class="field"><span>${label}</span><input name="${name}" ${attrs}></label>`;
  return `
    <form class="card contact-form" novalidate>
      <h2>Add a contact</h2>
      ${field("name", "Name *", 'autocomplete="off" required')}
      ${field("how_met", "How you met *", 'placeholder="Career fair, class, a friend…" required')}
      ${field("last_contact", "Date met *", `type="date" value="${today}" max="${today}" required`)}
      ${field("company", "Company")}
      ${field("role", "Role")}
      ${field("phone", "Phone", 'type="tel" inputmode="tel" autocomplete="off" placeholder="(801) 555-0123"')}
      ${field("email", "Email", 'type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="name@company.com"')}
      <label class="field"><span>Notes (one per line)</span>
        <textarea name="notes" rows="3" placeholder="What did you talk about?"></textarea></label>
      <div class="sheet-actions">
        <button class="btn" type="submit">Save contact</button>
        <button class="btn btn-ghost" type="button" data-action="cancel-add">Cancel</button>
      </div>
    </form>`;
}

// Turns raw form values into the POST /api/contacts body.
export function validateContactForm(values, today = todayISO()) {
  const v = values ?? {};
  const clean = (x) => String(x ?? "").trim();
  const payload = {
    name: clean(v.name),
    how_met: clean(v.how_met),
    last_contact: clean(v.last_contact),
    company: clean(v.company),
    role: clean(v.role),
    phone: clean(v.phone),
    email: clean(v.email),
    notes: String(v.notes ?? "").split("\n").map((n) => n.trim()).filter(Boolean),
  };
  const errors = {};
  if (!payload.name) errors.name = "Add their name";
  if (payload.phone && !isValidPhone(payload.phone)) errors.phone = "That doesn't look like a phone number";
  if (payload.email && !isValidEmail(payload.email)) errors.email = "That doesn't look like an email";
  if (!payload.how_met) errors.how_met = "Add how you met";
  if (!payload.last_contact) errors.last_contact = "Pick the date you met";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.last_contact) || daysSince(payload.last_contact, today) === null) {
    errors.last_contact = "That isn't a valid date";
  } else if (daysSince(payload.last_contact, today) < 0) {
    errors.last_contact = "That date is in the future";
  }
  return { ok: Object.keys(errors).length === 0, errors, payload };
}

export function renderContactsScreen(contacts, today) {
  return `
    <div class="block-head"><h1>Contacts</h1>
      <button class="btn btn-small" data-action="add-contact">+ Add</button></div>
    <input class="search" type="search" placeholder="Search name, company, notes…" aria-label="Search contacts">
    <div id="contact-form-slot"></div>
    <div id="contact-list">${renderContactList(contacts, today)}</div>`;
}

// ---------- screen ----------

let query = "";

function redrawList(el) {
  el.querySelector("#contact-list").innerHTML = renderContactList(getState()?.contacts ?? [], undefined, query);
}

function showFieldErrors(form, errors) {
  form.querySelectorAll(".field-error").forEach((x) => x.remove());
  for (const [name, msg] of Object.entries(errors)) {
    form.querySelector(`[name=${name}]`).insertAdjacentHTML("afterend", `<em class="field-error">${esc(msg)}</em>`);
  }
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
    showFieldErrors(form, errors);
    if (!ok) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await post("/api/contacts", payload);
      await refreshState();
      slot.innerHTML = "";
      redrawList(el);
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
    query = "";
    el.innerHTML = renderContactsScreen(state.contacts);
    el.onclick = (e) => {
      if (e.target.closest("[data-action=add-contact]")) showForm(el);
    };
    el.querySelector(".search").addEventListener("input", (e) => {
      query = e.target.value;
      redrawList(el);
    });
  },
});
