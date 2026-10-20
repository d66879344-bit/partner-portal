-- Adds a free-text "sign text" field to orders — the greeting text written on
-- a name sign at pickup (e.g. "Welcome FLORINA GAVRILESCU"). It is always
-- typed out in full when the order is created; it is never auto-generated
-- from passenger_name. Run this once in Cloudflare D1 -> your database ->
-- Console (select all, then Run). Safe to run on a database that already has
-- orders in it.

ALTER TABLE orders ADD COLUMN sign_text TEXT;
