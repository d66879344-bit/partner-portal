// Passenger contacts (name, phone, instructions) are visible to a partner only
// until 24 hours after the trip is completed. After that the API stops sending
// them at all — hiding them in the page alone would not protect anything.
// The admin side is not affected.
export const LOCK_HOURS = 24;
// An accepted order that nobody ever marked as Dropped off would keep its contacts
// visible forever, so it is locked too, this long after its pickup time.
export const STALE_ACCEPTED_HOURS = 48;

let columnReady = false;
// Adds orders.completed_at once per worker instance; the error when the column
// already exists is expected and ignored.
export async function ensureCompletedColumn(db) {
  if (columnReady) return;
  try { await db.prepare("ALTER TABLE orders ADD COLUMN completed_at TEXT").run(); } catch (e) {}
  columnReady = true;
}

export function nowIso() { return new Date().toISOString(); }

function parseTs(v) {
  if (!v) return NaN;
  let s = String(v).trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  return Date.parse(s);
}

// order needs: status, completed_at, order_date, order_time.
// Counted from the moment the trip was completed (Dropped off). Orders that were
// completed before this feature existed have no such moment, so they are counted
// from their pickup time instead.
export function contactsLocked(order, now) {
  if (!order) return false;
  const t = now == null ? Date.now() : now;
  const pickup = order.order_date ? parseTs(order.order_date + "T" + (order.order_time || "00:00") + ":00") : NaN;
  if (order.status === "accepted") {
    return !isNaN(pickup) && t - pickup >= STALE_ACCEPTED_HOURS * 3600 * 1000;
  }
  if (order.status !== "completed") return false;
  let ref = parseTs(order.completed_at);
  if (isNaN(ref)) ref = pickup;
  if (isNaN(ref)) return false;
  return t - ref >= LOCK_HOURS * 3600 * 1000;
}
