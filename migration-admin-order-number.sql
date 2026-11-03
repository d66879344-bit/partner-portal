-- Adds the admin-only internal order number (Admin #) to orders.
-- Safe to run once; D1 has no "ADD COLUMN IF NOT EXISTS", so re-running
-- this after it has already succeeded will fail with "duplicate column
-- name" — that's expected and means it's already applied.

ALTER TABLE orders ADD COLUMN admin_number TEXT;
