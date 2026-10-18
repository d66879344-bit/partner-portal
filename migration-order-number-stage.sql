-- Second migration: adds a manually-entered order number and trip-progress stage.
-- Run this once in Cloudflare D1 -> your database -> Console (select all, then Run).
-- Safe to run on a database that already has orders in it.

ALTER TABLE orders ADD COLUMN order_number TEXT;
ALTER TABLE orders ADD COLUMN trip_stage TEXT;
