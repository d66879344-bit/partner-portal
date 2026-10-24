import { checkAdminSecret } from "../../_lib/auth.js";

// Reassigns a declined/cancelled order to a different (active) partner, optionally
// tweaking a few fields along the way, without recreating the order from scratch.
// The order goes back to "offered" for the new partner, with any previous driver/
// vehicle assignment and trip progress cleared.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const partnerId = Number(body.partnerId);
    if (!id || !partnerId) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id, status FROM orders WHERE id = ?").bind(id).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "declined" && order.status !== "cancelled") {
      return Response.json({ error: "not_reassignable" }, { status: 409 });
    }

    const partner = await env.DB.prepare("SELECT id, status FROM partners WHERE id = ?").bind(partnerId).first();
    if (!partner) return Response.json({ error: "partner_not_found" }, { status: 404 });
    if (partner.status !== "active") return Response.json({ error: "partner_not_active" }, { status: 409 });

    const pickup = (body.pickup || "").toString().trim().slice(0, 200);
    const dropoff = (body.dropoff || "").toString().trim().slice(0, 200);
    const orderDate = (body.orderDate || "").toString().trim().slice(0, 20);
    const orderTime = (body.orderTime || "").toString().trim().slice(0, 10);
    const price = (body.price || "").toString().trim().slice(0, 30);
    const currency = (body.currency || "").toString().trim().slice(0, 10);
    const signText = body.signText !== undefined ? (body.signText || "").toString().trim().slice(0, 200) : null;

    const sets = ["partner_id = ?", "status = 'offered'", "trip_stage = NULL", "responded_at = NULL", "driver_id = NULL", "vehicle_id = NULL"];
    const vals = [partnerId];
    if (pickup) { sets.push("pickup = ?"); vals.push(pickup); }
    if (dropoff) { sets.push("dropoff = ?"); vals.push(dropoff); }
    if (orderDate) { sets.push("order_date = ?"); vals.push(orderDate); }
    if (orderTime) { sets.push("order_time = ?"); vals.push(orderTime); }
    if (price) { sets.push("price = ?"); vals.push(price); }
    if (currency) { sets.push("currency = ?"); vals.push(currency); }
    if (signText !== null) { sets.push("sign_text = ?"); vals.push(signText); }
    vals.push(id);

    await env.DB.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
