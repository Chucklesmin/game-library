import test from "node:test";
import assert from "node:assert/strict";

const score = (needle, target) => {
  const distance = Math.abs(needle - target);
  return distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : 0;
};

test("Wavelength awards the correct shared-score proximity bands", () => {
  assert.equal(score(50, 55), 4);
  assert.equal(score(50, 62), 3);
  assert.equal(score(50, 70), 2);
  assert.equal(score(50, 71), 0);
});

test("Wavelength gives no shared points outside the scoring band", () => {
  assert.equal(score(50, 71), 0);
});
