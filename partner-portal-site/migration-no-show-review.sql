-- Adds the admin review state for a Customer no-show report: pending until an
-- admin confirms or rejects it. Run this once in Cloudflare D1 -> your
-- database -> Console (select all, then Run). Safe to run on a database that
-- already has orders in it.

-- NULL = pending review (default) | 'confirmed' | 'rejected'.
-- Confirming also sets orders.status = 'completed' (counts as a completed
-- trip for the partner and, later, in financial reporting). Rejecting
-- leaves status = 'no_show' so the admin can follow up separately.
ALTER TABLE orders ADD COLUMN no_show_review_status TEXT;
