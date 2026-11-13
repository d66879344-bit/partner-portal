import { checkAdminSecret } from "../../_lib/auth.js";
import { notifyText, orderCancelledMessage } from "../../_lib/whatsapp.js";

// The one and only "Delete order": removes the order everywhere (admin and
// partner) for good. If the partner could still see it (offered / accepted),
// their WhatsApp group is told first that the order is cancelled.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id, partner_id, status, order_number FROM orders WHERE id = ?").bind(id).first();
    if (!order) return Response.json({ ok: true });

    await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();

    if (order.status === "offered" || order.status === "accepted") {
      notifyText(context, order.partner_id, orderCancelledMessage(order.order_number || order.id));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
