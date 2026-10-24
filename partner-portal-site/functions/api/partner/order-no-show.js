import { getPartnerId } from "../../_lib/auth.js";

// Finalizes a Customer-no-show report: the evidence categories themselves are
// uploaded one at a time via /api/partner/documents (ownerType=order); this
// endpoint is the "Send report to admin" step that closes the trip out.
export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id, partner_id, status FROM orders WHERE id = ?").bind(id).first();
    if (!order || order.partner_id !== partnerId) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "accepted") return Response.json({ error: "not_accepted" }, { status: 409 });

    const evidenceRow = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM documents WHERE partner_id = ? AND owner_type = 'order' AND owner_id = ?"
    ).bind(partnerId, id).first();
    if (!evidenceRow || !evidenceRow.n) {
      return Response.json({ error: "no_evidence" }, { status: 400 });
    }

    await env.DB.prepare(
      "UPDATE orders SET status = 'no_show', no_show_type = 'customer', no_show_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
