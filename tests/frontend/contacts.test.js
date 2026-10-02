import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lastContactLabel, sortContacts, filterContacts, renderContact, renderContactList,
  renderContactForm, validateContactForm, renderContactsScreen, isValidEmail, isValidPhone, telHref,
} from "../../frontend/contacts.js";
import { SEED } from "../../frontend/mock.js";

const TODAY = "2026-10-02";
const valid = {
  name: "Marcus", how_met: "Qualtrics info session", last_contact: "2026-10-01",
  company: "Qualtrics", role: "Data engineer", notes: "",
};

test("lastContactLabel phrases the gap", () => {
  assert.equal(lastContactLabel("2026-10-02", TODAY), "Talked today");
  assert.equal(lastContactLabel("2026-10-01", TODAY), "Talked yesterday");
  assert.equal(lastContactLabel("2026-09-10", TODAY), "Talked 22 days ago");
  assert.equal(lastContactLabel(undefined, TODAY), "");
});

test("sortContacts puts the most recent first and doesn't mutate", () => {
  const input = [{ name: "A", last_contact: "2026-09-01" }, { name: "B" }, { name: "C", last_contact: "2026-09-20" }];
  assert.deepEqual(sortContacts(input).map((c) => c.name), ["C", "A", "B"]);
  assert.equal(input[0].name, "A");
  assert.deepEqual(sortContacts(null), []);
});

// ---------- search ----------

test("filterContacts searches name, company, role, how met, and notes", () => {
  const c = SEED.contacts;
  assert.deepEqual(filterContacts(c, "sarah").map((x) => x.name), ["Sarah"]);
  assert.deepEqual(filterContacts(c, "PLURALSIGHT").map((x) => x.name), ["Jordan"]);
  assert.deepEqual(filterContacts(c, "graduate").map((x) => x.name), ["Priya"]);
  assert.deepEqual(filterContacts(c, "career fair").map((x) => x.name), ["Jordan"]);
  assert.deepEqual(filterContacts(c, "airflow").map((x) => x.name), ["Priya"]);
});

test("filterContacts requires every word and ignores extra spaces", () => {
  assert.deepEqual(filterContacts(SEED.contacts, "  byu   grant ").map((x) => x.name), ["Sarah"]);
  assert.deepEqual(filterContacts(SEED.contacts, "byu pluralsight"), []);
});

test("filterContacts returns everything for an empty query and survives bad input", () => {
  assert.equal(filterContacts(SEED.contacts, "").length, 3);
  assert.equal(filterContacts(SEED.contacts, undefined).length, 3);
  assert.deepEqual(filterContacts(null, "x"), []);
  assert.equal(filterContacts([{ name: "Z", notes: "string note" }], "string").length, 1);
});

// ---------- rendering ----------

test("renderContact shows role, company, how met, notes, and timing", () => {
  const html = renderContact(SEED.contacts[0], TODAY);
  assert.match(html, /Sarah/);
  assert.match(html, /Research scientist · BYU/);
  assert.match(html, /Met: Mom&#39;s friend/);
  assert.match(html, /<li>Grant deadline mid-October<\/li>/);
  assert.match(html, /Talked 22 days ago/);
});

test("renderContact links phone and email, and leaves them out when missing", () => {
  const html = renderContact({ id: "x", name: "Marcus", phone: "(801) 555-0123", email: "m@q.com" }, TODAY);
  assert.match(html, /href="tel:8015550123"/);
  assert.match(html, /href="mailto:m@q.com"/);
  assert.doesNotMatch(renderContact(SEED.contacts[0], TODAY), /contact-links/);
});

test("renderContact escapes phone and email", () => {
  const html = renderContact({ id: "x", name: "Z", email: `"><script>@x.com` }, TODAY);
  assert.doesNotMatch(html, /<script>/);
});

test("filterContacts searches phone and email too", () => {
  const list = [{ name: "Marcus", email: "marcus@qualtrics.com", phone: "801-555-0123" }, { name: "Z" }];
  assert.equal(filterContacts(list, "qualtrics.com").length, 1);
  assert.equal(filterContacts(list, "555-0123").length, 1);
});

test("renderContact handles a bare contact and string notes", () => {
  assert.match(renderContact({ id: "x" }, TODAY), /Unnamed/);
  assert.match(renderContact({ id: "x", name: "Z", notes: "one note" }, TODAY), /<li>one note<\/li>/);
});

test("renderContact escapes user-entered text", () => {
  const html = renderContact({ id: "x", name: "<img onerror=1>", notes: ["<script>"] }, TODAY);
  assert.doesNotMatch(html, /<img|<script>/);
});

test("renderContactList renders contacts most recent first", () => {
  const html = renderContactList(SEED.contacts, TODAY);
  assert.ok(html.indexOf("Priya") < html.indexOf("Jordan"));
  assert.ok(html.indexOf("Jordan") < html.indexOf("Sarah"));
});

test("renderContactList filters by query and explains empty results", () => {
  const html = renderContactList(SEED.contacts, TODAY, "dom");
  assert.match(html, /Priya/);
  assert.doesNotMatch(html, /Sarah/);
  assert.match(renderContactList(SEED.contacts, TODAY, "<zzz>"), /No contacts match "&lt;zzz&gt;"/);
  assert.match(renderContactList([], TODAY), /No contacts yet/);
});

// ---------- form ----------

test("renderContactForm has every field, with the date defaulting to today", () => {
  const html = renderContactForm(TODAY);
  for (const f of ["name", "how_met", "last_contact", "company", "role", "phone", "email", "notes"]) {
    assert.match(html, new RegExp(`name="${f}"`));
  }
  assert.match(html, /name="phone" type="tel"/);
  assert.match(html, /name="email" type="email"/);
  assert.match(html, /type="date" value="2026-10-02" max="2026-10-02"/);
  assert.match(html, /How you met \*/);
});

test("validateContactForm builds the POST /api/contacts body", () => {
  const { ok, payload } = validateContactForm({
    ...valid, name: "  Marcus ", phone: " (801) 555-0123 ", email: " marcus@qualtrics.com ",
    notes: "Team moving to dbt\n\n  Likes Rust  \n",
  }, TODAY);
  assert.equal(ok, true);
  assert.deepEqual(payload, {
    name: "Marcus", how_met: "Qualtrics info session", last_contact: "2026-10-01",
    company: "Qualtrics", role: "Data engineer", phone: "(801) 555-0123", email: "marcus@qualtrics.com",
    notes: ["Team moving to dbt", "Likes Rust"],
  });
});

test("validateContactForm leaves phone and email optional but checks them when given", () => {
  const blank = validateContactForm({ ...valid, phone: "", email: "" }, TODAY);
  assert.equal(blank.ok, true);
  assert.equal(blank.payload.phone, "");
  const bad = validateContactForm({ ...valid, phone: "call me", email: "marcus@" }, TODAY);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["email", "phone"]);
});

test("isValidEmail accepts normal addresses and rejects typos", () => {
  for (const e of ["a@b.co", "first.last+tag@byu.edu"]) assert.equal(isValidEmail(e), true, e);
  for (const e of ["", "marcus", "marcus@", "@byu.edu", "a@b", "a b@c.com", undefined]) assert.equal(isValidEmail(e), false, String(e));
});

test("isValidPhone accepts common formats and rejects junk", () => {
  for (const p of ["801-555-0123", "(801) 555-0123", "+1 801 555 0123", "8015550123", "555.0123"]) {
    assert.equal(isValidPhone(p), true, p);
  }
  for (const p of ["", "123", "call me", "801-555-0123 ext", "1234567890123456", undefined]) {
    assert.equal(isValidPhone(p), false, String(p));
  }
});

test("telHref strips formatting and keeps a leading +", () => {
  assert.equal(telHref("(801) 555-0123"), "tel:8015550123");
  assert.equal(telHref(" +1 801 555 0123"), "tel:+18015550123");
});

test("validateContactForm requires name, how met, and date", () => {
  const { ok, errors } = validateContactForm({ name: " ", how_met: "", last_contact: "" }, TODAY);
  assert.equal(ok, false);
  assert.deepEqual(Object.keys(errors).sort(), ["how_met", "last_contact", "name"]);
  assert.equal(validateContactForm(undefined, TODAY).ok, false);
});

test("validateContactForm allows today but rejects future and malformed dates", () => {
  assert.equal(validateContactForm({ ...valid, last_contact: TODAY }, TODAY).ok, true);
  assert.match(validateContactForm({ ...valid, last_contact: "2026-10-03" }, TODAY).errors.last_contact, /future/);
  assert.match(validateContactForm({ ...valid, last_contact: "10/01/2026" }, TODAY).errors.last_contact, /valid/);
  assert.match(validateContactForm({ ...valid, last_contact: "2026-13-45" }, TODAY).errors.last_contact, /valid/);
});

test("validateContactForm leaves company and role optional", () => {
  assert.equal(validateContactForm({ ...valid, company: "", role: "" }, TODAY).ok, true);
});

test("renderContactsScreen includes add button, search, and list", () => {
  const html = renderContactsScreen(SEED.contacts, TODAY);
  assert.match(html, /data-action="add-contact"/);
  assert.match(html, /type="search"/);
  assert.match(html, /id="contact-list"/);
  assert.doesNotMatch(html, /letter-index/);
});
