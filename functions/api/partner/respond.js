import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const action = (body.action || "").toString();
    if (!id || (action !== "accept" && action !== "decline")) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const order = await env.DB.prepare("SELECT id, partner_id, status FROM orders WHERE id = ?").bind(id).first();
    if (!order || order.partner_id !== partnerId) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (order.status !== "offered") {
      return Response.json({ error: "already_responded", status: order.status }, { status: 409 });
    }

    const newStatus = action === "accept" ? "accepted" : "declined";
    await env.DB.prepare("UPDATE orders SET status = ?, responded_at = datetime('now') WHERE id = ?")
      .bind(newStatus, id).run();

    return Response.json({ ok: true, status: newStatus });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
