-- One-time migration: adds the account ID and covered-airports fields to
-- existing partner-portal databases. Run once in the Cloudflare dashboard:
-- Workers & Pages -> D1 -> your database -> Console, paste this file, run.
--
-- Safe to run even if partners already exist — account_id is left NULL for
-- existing rows and is generated lazily the first time each partner's
-- dashboard loads (see functions/api/partner/me.js).

ALTER TABLE partners ADD COLUMN account_id TEXT;
ALTER TABLE partners ADD COLUMN covered_airports TEXT NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_account_id ON partners(account_id);
