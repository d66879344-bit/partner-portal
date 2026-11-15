import { getPartnerId } from "../../_lib/auth.js";
import { ensureChangeRequestColumn } from "../../_lib/change-request.js";

// During the trial a partner can't decline an order. Instead they send it back
// to us as a change request: what to change, why, and details (all required).
// The order moves to "declined" in the admin with the request attached; the
// admin edits it and sends it again.
const WHAT = ["time", "price", "pickup", "dropoff", "vehicle", "other"];
const REASONS = ["no_vehicle", "no_driver", "time_conflict", "price_low", "route_issue", "other"];

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const what = (body.what || "").toString();
    const reason = (body.reason || "").toString();
    const comment = (body.comment || "").toString().trim().slice(0, 500);
    if (!id || WHAT.indexOf(what) === -1 || REASONS.indexOf(reason) === -1 || !comment) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const order = await env.DB.prepare("SELECT id, partner_id, status FROM orders WHERE id = ?").bind(id).first();
    if (!order || order.partner_id !== partnerId) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "offered") return Response.json({ error: "already_responded", status: order.status }, { status: 409 });

    await ensureChangeRequestColumn(env.DB);
    const payload = JSON.stringify({ what, reason, comment, at: new Date().toISOString().slice(0, 19).replace("T", " ") });
    await env.DB.prepare(
      "UPDATE orders SET status = 'declined', responded_at = datetime('now'), change_request = ? WHERE id = ? AND status = 'offered'"
    ).bind(payload, id).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
