-- Adds a "vehicles needed" count to orders — how many vehicles this single
-- order requires (e.g. a group that needs 2 cars sent out together), instead
-- of having to create a separate order per vehicle. Purely informational:
-- it does not require a driver/vehicle to be assigned per unit, and does not
-- change any assignment logic. Defaults to 1 for every existing and new
-- order. Run this once in Cloudflare D1 -> your database -> Console (select
-- all, then Run). Safe to run on a database that already has orders in it.

ALTER TABLE orders ADD COLUMN vehicles_needed INTEGER NOT NULL DEFAULT 1;
