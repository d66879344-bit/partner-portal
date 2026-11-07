-- Adds the driver-link feature: a no-login magic link a partner can hand to
-- their driver for one specific trip, letting the driver view just that
-- trip's details and advance its status, with nothing else accessible.
-- Run this once in Cloudflare D1 -> your database -> Console (select all,
-- then Run). Safe to run on a database that already has orders in it.

ALTER TABLE orders ADD COLUMN driver_token TEXT;
ALTER TABLE orders ADD COLUMN driver_token_active INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_driver_token ON orders(driver_token);
