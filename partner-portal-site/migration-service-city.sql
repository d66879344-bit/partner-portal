-- One-time migration: adds the "city of service" field to existing
-- partner-portal databases. Run once in the Cloudflare dashboard:
-- Workers & Pages -> D1 -> your database -> Console, paste this file, run.
--
-- Safe to run even if partners already exist — service_city is simply NULL
-- for existing rows until they set it from their Account tab.

ALTER TABLE partners ADD COLUMN service_city TEXT;
