import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lastContactLabel, sortContacts, renderContact, renderContactList,
  renderContactForm, validateContactForm, renderContactsScreen,
} from "../../frontend/contacts.js";
import { SEED } from "../../frontend/mock.js";

const TODAY = "2026-10-02";

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

test("renderContact shows role, company, how met, notes, and timing", () => {
  const html = renderContact(SEED.contacts[0], TODAY);
  assert.match(html, /Sarah/);
  assert.match(html, /Research scientist · BYU/);
  assert.match(html, /Met: Mom&#39;s friend/);
  assert.match(html, /<li>Grant deadline mid-October<\/li>/);
  assert.match(html, /Talked 22 days ago/);
});

test("renderContact handles a bare contact and string notes", () => {
  assert.match(renderContact({ id: "x" }, TODAY), /Unnamed/);
  assert.match(renderContact({ id: "x", name: "Z", notes: "one note" }, TODAY), /<li>one note<\/li>/);
});

test("renderContact escapes user-entered text", () => {
  const html = renderContact({ id: "x", name: "<img onerror=1>", notes: ["<script>"] }, TODAY);
  assert.doesNotMatch(html, /<img|<script>/);
});

test("renderContactList renders all contacts or an empty state", () => {
  const html = renderContactList(SEED.contacts, TODAY);
  for (const c of SEED.contacts) assert.match(html, new RegExp(c.name));
  assert.match(renderContactList([], TODAY), /No contacts yet/);
});

test("validateContactForm builds the POST /api/contacts body", () => {
  const { ok, payload } = validateContactForm({
    name: "  Marcus ", how_met: "Qualtrics info session", company: "Qualtrics", role: "Data engineer",
    notes: "Team moving to dbt\n\n  Likes Rust  \n",
  });
  assert.equal(ok, true);
  assert.deepEqual(payload, {
    name: "Marcus", how_met: "Qualtrics info session", company: "Qualtrics", role: "Data engineer",
    notes: ["Team moving to dbt", "Likes Rust"],
  });
});

test("validateContactForm requires a name", () => {
  const { ok, errors } = validateContactForm({ name: "   " });
  assert.equal(ok, false);
  assert.ok(errors.name);
  assert.equal(validateContactForm(undefined).ok, false);
});

test("renderContactForm has every field the API needs", () => {
  const html = renderContactForm();
  for (const f of ["name", "how_met", "company", "role", "notes"]) assert.match(html, new RegExp(`name="${f}"`));
});

test("renderContactsScreen includes the add button and list", () => {
  const html = renderContactsScreen(SEED.contacts, TODAY);
  assert.match(html, /data-action="add-contact"/);
  assert.match(html, /id="contact-list"/);
});
