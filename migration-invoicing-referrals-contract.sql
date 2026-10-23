-- Adds everything needed for: the referral program (7% cumulative bonus),
-- trial-invoice generation, the testing-only "simulate trial ended" toggle,
-- and the signed-contract upload. Run this ONCE on the live Cloudflare D1
-- database (Workers & Pages -> D1 -> your database -> Console, paste this
-- file, then Run) BEFORE deploying the updated code — several endpoints now
-- read/write these columns and this table, and will fail if they don't exist
-- yet on the live database. Safe to run on a database that already has
-- partners/orders in it; every new column is nullable or defaulted.

-- Testing-only override: when 1, the trial always displays as ended
-- regardless of trial_started_at. Only ever toggled for one test account
-- (id656888) from the admin panel.
ALTER TABLE partners ADD COLUMN trial_simulate_ended INTEGER NOT NULL DEFAULT 0;

-- Referral program: set at registration from a ?ref=<accountId> link. Who
-- gets the 7% referral bonus on this partner's completed orders.
ALTER TABLE partners ADD COLUMN referred_by_partner_id INTEGER REFERENCES partners(id);

-- Invoicing: which of our own billing entities issues this partner's
-- invoice, and the address it's emailed to. Both admin-set, per partner.
ALTER TABLE partners ADD COLUMN billing_company TEXT;
ALTER TABLE partners ADD COLUMN billing_email TEXT;

-- Invoicing: the partner's own payment details, entered by the partner,
-- used to fill in "pay to" on their invoice.
ALTER TABLE partners ADD COLUMN pay_account_holder TEXT;
ALTER TABLE partners ADD COLUMN pay_bank_name TEXT;
ALTER TABLE partners ADD COLUMN pay_account_number TEXT; -- IBAN or account number
ALTER TABLE partners ADD COLUMN pay_swift TEXT;
ALTER TABLE partners ADD COLUMN pay_currency TEXT;

-- One invoice per partner, covering their 30-day trial period only. Billing
-- company/email and payment details are snapshotted here at generation time
-- so editing the partner's settings later never changes an existing invoice.
-- Trip line items are NOT stored here — computed client-side from the
-- partner's own completed orders inside [period_start, period_end].
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  invoice_number TEXT UNIQUE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated', -- generated | sent | received | processing | paid
  billing_company TEXT,
  billing_email TEXT,
  pay_account_holder TEXT,
  pay_bank_name TEXT,
  pay_account_number TEXT,
  pay_swift TEXT,
  pay_currency TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  status_updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_partner ON invoices(partner_id);
