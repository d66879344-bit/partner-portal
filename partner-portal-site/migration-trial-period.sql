-- Adds the trial-period column. Run once against the existing D1 database.
-- (Cloudflare dashboard: Workers & Pages -> D1 -> your database -> Console, paste this file.)

ALTER TABLE partners ADD COLUMN trial_started_at TEXT;
-- Set once, automatically, the first time this partner has an order reach
-- status 'completed' (see functions/_lib/trial.js). The 30-day trial window
-- is computed from this timestamp wherever it's shown — nothing else to run.
