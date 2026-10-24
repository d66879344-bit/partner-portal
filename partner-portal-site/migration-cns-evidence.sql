-- Adds support for the "Customer no-show" evidence workflow: a new order
-- outcome (no_show_type) plus an optional written note on documents, so
-- evidence can be a note instead of an uploaded file. Run this once in
-- Cloudflare D1 -> your database -> Console (select all, then Run). Safe to
-- run on a database that already has orders/documents in it.

-- 'customer' | 'driver' | NULL. Set together with orders.status = 'no_show'.
ALTER TABLE orders ADD COLUMN no_show_type TEXT;
ALTER TABLE orders ADD COLUMN no_show_at TEXT;

-- Evidence can be a written note instead of an uploaded file — file_key is ''
-- when there is no file, and note holds the partner's written explanation.
ALTER TABLE documents ADD COLUMN note TEXT;
