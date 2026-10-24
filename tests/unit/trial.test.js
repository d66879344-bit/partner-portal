// Plain unit tests for the pure trial-period math in functions/_lib/trial.js
// — no server, no deployed site, no credentials needed. Run with:
//   cd tests && node --test unit/
// (or `npm run test:unit` from tests/, see tests/package.json)
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrial } from "../../functions/_lib/trial.js";

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
}

test("computeTrial: no trial_started_at yet -> not ended, no dates", () => {
  const r = computeTrial({ trial_started_at: null, trial_simulate_ended: 0 });
  assert.equal(r.ended, false);
  assert.equal(r.start, null);
  assert.equal(r.end, null);
});

test("computeTrial: just started -> not ended", () => {
  const r = computeTrial({ trial_started_at: daysAgoIso(0), trial_simulate_ended: 0 });
  assert.equal(r.ended, false);
});

test("computeTrial: 15 days in -> not ended", () => {
  const r = computeTrial({ trial_started_at: daysAgoIso(15), trial_simulate_ended: 0 });
  assert.equal(r.ended, false);
});

test("computeTrial: exactly 30 calendar days in -> ended", () => {
  const r = computeTrial({ trial_started_at: daysAgoIso(30), trial_simulate_ended: 0 });
  assert.equal(r.ended, true);
});

test("computeTrial: 45 days in -> ended", () => {
  const r = computeTrial({ trial_started_at: daysAgoIso(45), trial_simulate_ended: 0 });
  assert.equal(r.ended, true);
});

test("computeTrial: trial_simulate_ended=1 forces ended=true even on day 0", () => {
  const r = computeTrial({ trial_started_at: daysAgoIso(0), trial_simulate_ended: 1 });
  assert.equal(r.ended, true);
});

test("computeTrial: trial_simulate_ended=0 does not force anything (real date still governs)", () => {
  const r = computeTrial({ trial_started_at: daysAgoIso(5), trial_simulate_ended: 0 });
  assert.equal(r.ended, false);
});

test("computeTrial: end date is exactly 30 days (UTC calendar days) after start", () => {
  const r = computeTrial({ trial_started_at: "2026-01-01 00:00:00", trial_simulate_ended: 0 });
  assert.equal(r.start.toISOString().slice(0, 10), "2026-01-01");
  assert.equal(r.end.toISOString().slice(0, 10), "2026-01-31");
});
