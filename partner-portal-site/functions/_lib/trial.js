// Starts a partner's 30-day trial the first time (and only the first time)
// one of their orders reaches status 'completed'. Safe to call on every
// completion — the WHERE guard makes it a no-op once the column is set.
export async function startTrialIfNeeded(env, partnerId) {
  await env.DB.prepare(
    "UPDATE partners SET trial_started_at = datetime('now') WHERE id = ? AND trial_started_at IS NULL"
  ).bind(partnerId).run();
}

const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function utcDateOnly(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Same calendar-day-UTC math as assets/trial.js's TrialInfo.compute(), plus
// the testing-only trial_simulate_ended override. Returns { ended, start, end }
// — start/end are Date objects, or null if the trial hasn't started yet.
export function computeTrial(partnerRow) {
  if (!partnerRow || !partnerRow.trial_started_at) {
    return { ended: false, start: null, end: null };
  }
  const start = new Date(String(partnerRow.trial_started_at).replace(" ", "T") + "Z");
  const startDay = utcDateOnly(start);
  const end = new Date(startDay + TRIAL_DAYS * DAY_MS);
  if (Number(partnerRow.trial_simulate_ended) === 1) {
    return { ended: true, start, end };
  }
  const nowDay = utcDateOnly(new Date());
  const elapsedDays = Math.round((nowDay - startDay) / DAY_MS);
  return { ended: elapsedDays >= TRIAL_DAYS, start, end };
}
