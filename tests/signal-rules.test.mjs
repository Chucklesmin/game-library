import test from "node:test";
import assert from "node:assert/strict";

const score = (needle, target) => {
  const distance = Math.abs(needle - target);
  return distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : 0;
};

test("Signal awards the correct proximity bands", () => {
  assert.equal(score(50, 55), 4);
  assert.equal(score(50, 62), 3);
  assert.equal(score(50, 70), 2);
  assert.equal(score(50, 71), 0);
});

test("a perfect center prevents intercept scoring", () => {
  const activeScore = score(50, 54);
  const interceptScore = activeScore !== 4 && 54 > 50 ? 1 : 0;
  assert.equal(interceptScore, 0);
});
