-- Migration: adds the extra order-detail fields to an existing database.
-- Run this once in Cloudflare D1 -> your database -> Console (select all, then Run).
-- Safe to run on a database that already has orders in it — existing rows just get
-- empty values for the new columns.

ALTER TABLE orders ADD COLUMN flight_number TEXT;
ALTER TABLE orders ADD COLUMN luggage INTEGER;
ALTER TABLE orders ADD COLUMN passenger_name TEXT;
ALTER TABLE orders ADD COLUMN passenger_phone TEXT;
ALTER TABLE orders ADD COLUMN meet_greet TEXT;
ALTER TABLE orders ADD COLUMN driver_id INTEGER REFERENCES drivers(id);
ALTER TABLE orders ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id);
