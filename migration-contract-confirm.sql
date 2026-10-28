-- Adds the contract-confirmation feature (partner clicks "Confirm" after
-- reading their uploaded contract) to the partners/documents tables.
-- Run this once against the D1 database bound to this Pages project as `DB`.
-- (Cloudflare dashboard: Workers & Pages -> D1 -> your database -> Console, paste this file.)
--
-- IMPORTANT: the UPDATE below grandfathers in every partner who already
-- exists in the database at the moment you run this migration — they will
-- never see the confirm prompt, even if their contract is replaced later.
-- Only partners who register AFTER this migration has run will go through
-- the normal confirm flow (new rows get contract_confirm_exempt = 0 from
-- the column's own DEFAULT, automatically).
--
-- Run this BEFORE (or at the same time as) uploading the new code, so there
-- is no window where the app expects these columns but they don't exist yet.

ALTER TABLE documents ADD COLUMN confirmed_at TEXT;

ALTER TABLE partners ADD COLUMN contract_confirm_exempt INTEGER NOT NULL DEFAULT 0;

-- Grandfather in everyone already registered as of right now:
UPDATE partners SET contract_confirm_exempt = 1;
