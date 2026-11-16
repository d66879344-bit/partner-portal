// Admin-controlled privacy switch, one per partner. While it is on, the partner
// no longer receives the passenger's name, phone and notes for COMPLETED trips
// (the API stops sending them — hiding them in the page alone would protect
// nothing). Orders that are still open always keep their contacts so the
// driver can reach the passenger. Off by default; the admin turns it on.
let columnReady = false;
export async function ensureHidePassengerColumn(db) {
  if (columnReady) return;
  try { await db.prepare("ALTER TABLE partners ADD COLUMN hide_passenger_data INTEGER NOT NULL DEFAULT 0").run(); } catch (e) {}
  columnReady = true;
}
export async function getHidePassengerData(db, partnerId) {
  await ensureHidePassengerColumn(db);
  try {
    const row = await db.prepare("SELECT hide_passenger_data FROM partners WHERE id = ?").bind(partnerId).first();
    return !!row && Number(row.hide_passenger_data) === 1;
  } catch (e) { return false; }
}
// Which of this partner's orders have their passenger data hidden.
export function passengerDataHidden(hideFlag, order) {
  return !!hideFlag && !!order && order.status === "completed";
}
