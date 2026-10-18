-- Partner portal — Cloudflare D1 schema (standalone site, independent of the
-- older document-intake project).
-- Run once against the D1 database bound to this Pages project as `DB`.
-- (Cloudflare dashboard: Workers & Pages -> D1 -> your database -> Console, paste this file.)

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  country TEXT NOT NULL,
  country_name TEXT,
  -- pending: just registered, can sign in, but not assigned orders yet.
  -- active: admin has reviewed documents and activated the account — can receive orders.
  -- blocked: admin has blocked the account — cannot sign in.
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  activated_at TEXT
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  plate TEXT,
  category TEXT,
  make TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  full_name TEXT,
  phone TEXT,
  language TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- owner_type: 'company' | 'vehicle' | 'driver' | 'other'
-- owner_id: NULL for company/other, vehicles.id or drivers.id otherwise
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  owner_type TEXT NOT NULL,
  owner_id INTEGER,
  field TEXT NOT NULL,
  label TEXT,
  filename TEXT,
  file_key TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | rejected
  review_note TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT,                             -- entered by admin, never auto-generated
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  pickup TEXT NOT NULL,
  dropoff TEXT NOT NULL,
  flight_number TEXT,
  flight_time TEXT,       -- flight arrival time
  buffer_minutes INTEGER, -- cushion between flight arrival and pickup
  order_date TEXT NOT NULL,
  order_time TEXT,        -- pickup time
  vehicle_type TEXT,
  passengers INTEGER,
  luggage INTEGER,
  passenger_name TEXT,
  passenger_phone TEXT,
  meet_greet TEXT,
  driver_id INTEGER REFERENCES drivers(id),
  vehicle_id INTEGER REFERENCES vehicles(id),
  price TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'offered',        -- offered | accepted | declined | completed | cancelled
  -- trip_stage only progresses while status = 'accepted':
  -- on_the_way -> arrived -> in_car -> dropped_off (reaching dropped_off also sets status = completed)
  trip_stage TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  hidden_from_admin INTEGER NOT NULL DEFAULT 0 -- hides the order from the admin view only; the partner still sees it
);

CREATE INDEX IF NOT EXISTS idx_vehicles_partner ON vehicles(partner_id);
CREATE INDEX IF NOT EXISTS idx_drivers_partner ON drivers(partner_id);
CREATE INDEX IF NOT EXISTS idx_documents_partner ON documents(partner_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_partners_status ON partners(status);
