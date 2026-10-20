// Starts a partner's 30-day trial the first time (and only the first time)
// one of their orders reaches status 'completed'. Safe to call on every
// completion — the WHERE guard makes it a no-op once the column is set.
export async function startTrialIfNeeded(env, partnerId) {
  await env.DB.prepare(
    "UPDATE partners SET trial_started_at = datetime('now') WHERE id = ? AND trial_started_at IS NULL"
  ).bind(partnerId).run();
}
