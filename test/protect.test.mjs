import { test } from "node:test";
import assert from "node:assert/strict";
import { protect, restore } from "../public/protect.js";

const draft = `Remote work cut commute emissions by 54% (Tao et al., 2023). It also changed hiring [1], [2–4].
As one manager put it, "we stopped caring where people lived and started caring what they shipped."
See https://example.com/report.pdf and doi:10.1073/pnas.2304099120 for the data.

References
1. Tao, Y. et al. (2023). Climate mitigation potentials of teleworking. PNAS, 120(39).
2. Smith, J. (2021). Hiring after the office.`;

test("locks citations, quotes, links, DOIs and sets the reference list aside", () => {
  const result = protect(draft);
  assert.ok(result.referenceBlock.startsWith("References"));
  assert.ok(!result.body.includes("Tao, Y."), "reference list must not be sent");
  for (const original of ["(Tao et al., 2023)", "[1]", "[2–4]", "https://example.com/report.pdf", "doi:10.1073/pnas.2304099120"]) {
    assert.ok(result.locked.includes(original), `expected ${original} to be locked`);
    assert.ok(!result.body.includes(original), `${original} should not be in the text sent to the model`);
  }
  assert.ok(result.locked.some((item) => item.startsWith('"we stopped caring')));
});

test("restores every locked item exactly, even after reordering", () => {
  const result = protect(draft);
  const tokens = result.locked.map((_, i) => `⟦C${i + 1}⟧`);
  const rewritten = `New text. ${[...tokens].reverse().join(" ")}`;
  const { text, missing } = restore(rewritten, result);
  assert.deepEqual(missing, []);
  for (const original of result.locked) assert.ok(text.includes(original));
  assert.ok(text.endsWith(result.referenceBlock));
});

test("reports items the model dropped and strips made-up tokens", () => {
  const result = protect(draft);
  const { text, missing } = restore("Short version ⟦C1⟧ ⟦C99⟧.", result);
  assert.equal(missing.length, result.locked.length - 1);
  assert.ok(!text.includes("⟦C99⟧"));
});

test("leaves ordinary parentheses and short quotes alone", () => {
  const { body, locked } = protect('We met (finally) and she said "fine".');
  assert.equal(locked.length, 0);
  assert.equal(body, 'We met (finally) and she said "fine".');
});

test("locks text the user chose, and restores it exactly", () => {
  const text = "The Articles of Confederation (1781) left Congress unable to tax. Shays' Rebellion scared the elites.";
  const result = protect(text, ["Shays' Rebellion", "x"]);
  assert.ok(result.locked.includes("Shays' Rebellion"));
  assert.ok(!result.locked.includes("x"), "one-character locks are ignored");
  assert.ok(!result.body.includes("Shays' Rebellion"));
  const { text: back, missing } = restore(result.body, result);
  assert.deepEqual(missing, []);
  assert.equal(back, text);
});
