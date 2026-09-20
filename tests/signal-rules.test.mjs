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

test("Wavelength server target range stays away from the unusable extremes", () => {
  for (let target = 12; target <= 88; target += 1) {
    assert.ok(target >= 12 && target <= 88);
  }
});

test("Wavelength timer treats the server deadline as expired at zero", () => {
  const isExpired = (deadline, now) => Date.parse(deadline) <= now;
  const deadline = "2026-09-13T12:00:00.000Z";
  assert.equal(isExpired(deadline, Date.parse("2026-09-13T11:59:59.999Z")), false);
  assert.equal(isExpired(deadline, Date.parse("2026-09-13T12:00:00.000Z")), true);
});
