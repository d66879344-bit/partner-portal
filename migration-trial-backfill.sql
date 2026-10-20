-- One-time backfill. Run ONCE, after migration-trial-period.sql, and only if
-- you already have partners whose first completed order happened before the
-- trial-period feature was deployed (startTrialIfNeeded only fires at the
-- moment an order *becomes* completed, so it never fired retroactively for
-- orders that were already completed).
--
-- This sets trial_started_at = now for any partner who has at least one
-- completed order but no trial_started_at yet — i.e. their trial starts
-- counting from today, the day this feature went live, rather than never
-- starting at all.
--
-- Safe to run more than once: it only ever touches rows where
-- trial_started_at is still NULL, so it will not reset or extend a trial
-- that has already started (whether by this script or automatically).
--
-- Cloudflare dashboard: Workers & Pages -> D1 -> your database -> Console, paste this file.

UPDATE partners
SET trial_started_at = datetime('now')
WHERE trial_started_at IS NULL
  AND EXISTS (
    SELECT 1 FROM orders WHERE orders.partner_id = partners.id AND orders.status = 'completed'
  );
