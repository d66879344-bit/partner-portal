-- Adds the partner's preferred dashboard language (en | ru | es | el | fr | pt).
-- Defaults to 'en' for existing partners; the dashboard falls back to the
-- browser's language on a partner's very first visit before they ever save
-- a preference. Run this once in Cloudflare D1 -> your database -> Console
-- (select all, then Run). Safe to run on a database that already has
-- partners in it.

ALTER TABLE partners ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
