// "Late cancellation": an accepted order that the customer cancelled shortly before
// pickup but that we still pay the partner for. It is stored as an ordinary
// completed order (so the invoice, earnings and reports count it automatically)
// with orders.late_cancel = 1 as a marker. The column is added lazily the first
// time it is needed, so no manual migration is required.
let columnReady = false;
// Returns true when orders.late_cancel exists (and can be used in queries).
export async function ensureLateCancelColumn(db) {
  if (columnReady) return true;
  try {
    await db.prepare("ALTER TABLE orders ADD COLUMN late_cancel INTEGER NOT NULL DEFAULT 0").run();
    columnReady = true;
    return true;
  } catch (e) {
    try {
      await db.prepare("SELECT late_cancel FROM orders LIMIT 1").first();
      columnReady = true;
      return true;
    } catch (e2) {
      return false;
    }
  }
}
