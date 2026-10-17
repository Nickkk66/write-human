import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, rhythm } from "../public/checker.js";

const labels = (text) => analyze(text).findings.map((f) => f.label);

test("flags the strongest tells", () => {
  const found = labels("It's not just a feature, it's a movement. Here's the thing: we delve deeper. Let that sink in. The result? Growth.");
  for (const label of ['"Not X, it\'s Y"', "Staged run-up", "Overused AI word", "Dramatic pause line", "Question it answers itself"]) {
    assert.ok(found.includes(label), `missing ${label}; got ${found.join(", ")}`);
  }
});

test("marks [ADD: ...] placeholders separately", () => {
  const { findings } = analyze("We grew a lot [ADD: the actual growth number] last year.");
  assert.equal(findings.find((f) => f.kind === "add")?.label, "Needs a real detail from you");
});

test("plain human writing passes clean", () => {
  const text = "I moved to Leeds in March. The flat was cold, and the landlord took three weeks to fix the boiler, which meant a lot of tea and two jumpers indoors. It's fine now. Mostly I like the walk to work, past the canal and the old mill that nobody has figured out what to do with.";
  assert.deepEqual(labels(text), []);
  assert.equal(rhythm(text).ok, true);
});

test("catches uniform sentence rhythm", () => {
  const text = "The team worked on the new release for three weeks. They fixed most of the bugs that users had reported. The designers updated the main screens with new colors. Marketing prepared a short campaign for the launch date. Everyone agreed the release was ready to go out.";
  assert.equal(rhythm(text).ok, false);
});

test("ignores common acronyms", () => {
  assert.ok(!labels("Our CEO shipped the API docs as a PDF.").includes("ALL CAPS emphasis"));
});
