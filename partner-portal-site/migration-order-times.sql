-- Third migration: splits out flight arrival time and a buffer, separate from pickup time.
-- Run this once in Cloudflare D1 -> your database -> Console (select all, then Run).
-- Safe to run on a database that already has orders in it.

ALTER TABLE orders ADD COLUMN flight_time TEXT;
ALTER TABLE orders ADD COLUMN buffer_minutes INTEGER;
