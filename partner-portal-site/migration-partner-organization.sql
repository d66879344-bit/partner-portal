-- Adds an admin-only "organization" tag on each partner — which outside
-- organization (ShuttleDirect, Mozio, ...) this partner account works through,
-- if any. Purely internal bookkeeping: never sent to the partner, never shown
-- on the partner dashboard. Nullable — most partners won't have one set.
--
-- Run this on the live Cloudflare D1 database (Workers & Pages -> D1 -> your
-- database -> Console, paste this file) BEFORE deploying the updated code —
-- the admin partners list and partner detail endpoints now SELECT this column,
-- and will fail if it doesn't exist yet on the live database.

ALTER TABLE partners ADD COLUMN organization TEXT;
