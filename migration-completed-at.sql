-- Moment an order was completed (Dropped off). Used to hide passenger contacts
-- from the partner 24 hours later. The code adds this column by itself on first
-- use; run this only if you prefer to do it by hand.
ALTER TABLE orders ADD COLUMN completed_at TEXT;
