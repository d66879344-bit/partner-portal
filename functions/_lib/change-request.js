// A partner on the trial can't decline an order. Instead they send it back with
// a change request (what to change, why, details). The order goes to "declined"
// in the admin, and this JSON stays on it so the admin can see the request.
let ready = false;
export async function ensureChangeRequestColumn(db) {
  if (ready) return;
  try { await db.prepare("ALTER TABLE orders ADD COLUMN change_request TEXT").run(); } catch (e) {}
  ready = true;
}
export function parseChangeRequest(raw) {
  if (!raw) return null;
  try { const v = JSON.parse(raw); return v && typeof v === "object" ? v : null; } catch (e) { return null; }
}
