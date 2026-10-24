-- Adds the ability to hide an order from the admin view only, without touching it
-- for the partner. Run this once in Cloudflare D1 -> your database -> Console
-- (select all, then Run). Safe to run on a database that already has orders in it.

ALTER TABLE orders ADD COLUMN hidden_from_admin INTEGER NOT NULL DEFAULT 0;
