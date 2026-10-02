import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TASK_META, taskMeta, difficultyLabel, openTasks, reflectionCopy,
  renderReflectionForm, validateReflection, renderTaskSuccess, renderTaskMissing,
} from "../../frontend/tasks.js";
import { SEED } from "../../frontend/mock.js";

const task = (id) => SEED.tasks.find((t) => t.id === id);

test("every seeded task type has metadata", () => {
  for (const t of SEED.tasks) assert.ok(TASK_META[t.type], t.type);
});

test("taskMeta and difficultyLabel fall back sensibly", () => {
  assert.equal(taskMeta({ type: "event" }).label, "Nearby event");
  assert.equal(taskMeta({ type: "???" }).label, "Connection");
  assert.equal(taskMeta(undefined).label, "Connection");
  assert.equal(difficultyLabel({ difficulty: "hard" }), "Hard");
  assert.equal(difficultyLabel({}), "Medium");
});

test("openTasks: real-world first, then by XP; finished tasks dropped", () => {
  assert.deepEqual(openTasks(SEED.tasks).map((t) => t.id), ["t1", "t5", "t2", "t4", "t3", "t6"]);
  assert.deepEqual(openTasks([{ id: "a", status: "complete" }]), []);
  assert.deepEqual(openTasks(null), []);
});

test("reflectionCopy changes for in-person vs online tasks", () => {
  assert.equal(reflectionCopy(task("t1")).person, "Who did you meet?");
  assert.equal(reflectionCopy(task("t3")).person, "Who are you reaching out to?");
  assert.match(reflectionCopy(task("t1")).successCopy("Marcus"), /follow up with Marcus/);
});

test("renderReflectionForm has the four fields the API needs", () => {
  const html = renderReflectionForm(task("t1"));
  for (const f of ["met_name", "role", "company", "hook"]) assert.match(html, new RegExp(`name="${f}"`));
  assert.match(html, /In person · Medium/);
  assert.match(html, /Who did you meet\?/);
  assert.match(html, /\+75 XP/);
  assert.match(html, /novalidate/);
});

test("validateReflection trims and requires every field", () => {
  const ok = validateReflection({ met_name: " Marcus ", role: "DE", company: "Qualtrics", hook: " dbt " });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.payload, { met_name: "Marcus", role: "DE", company: "Qualtrics", hook: "dbt" });
  const bad = validateReflection({ met_name: "", role: " ", company: "", hook: "" });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["company", "hook", "met_name", "role"]);
  assert.equal(validateReflection(undefined).ok, false);
});

test("renderTaskSuccess shows the contact, XP, streak, and a way back to tasks", () => {
  const html = renderTaskSuccess(task("t1"), {
    contact: { name: "Marcus", role: "Data engineer", company: "Qualtrics", notes: ["Team moving to dbt"] },
    xp_earned: 75, streak: 5,
  });
  assert.match(html, /That detail is worth keeping/);
  assert.match(html, /Data engineer · Qualtrics/);
  assert.match(html, /Team moving to dbt/);
  assert.match(html, /\+75 XP/);
  assert.match(html, /streak is now 5 days/);
  assert.match(html, /data-action="more-tasks">Pick another task/);
});

test("renderTaskSuccess copes with a sparse result", () => {
  const html = renderTaskSuccess(task("t3"), {});
  assert.match(html, /That outreach is now in motion/);
  assert.match(html, /New contact/);
  assert.match(html, /\+30 XP/, "falls back to the task's XP");
});

test("renderTaskMissing escapes and links back to tasks", () => {
  const html = renderTaskMissing("<nope>");
  assert.match(html, /&lt;nope&gt;/);
  assert.match(html, /data-action="more-tasks"/);
});
