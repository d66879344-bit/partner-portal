import { checkAdminSecret } from "../../_lib/auth.js";

// Admin review of a Customer-no-show report. Confirming the report closes the
// trip out as completed (so it shows as completed for the partner and will
// count in financial reporting later); rejecting it leaves the order in the
// no_show state but marks it reviewed, so it stops showing as actionable.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const action = (body.action || "").toString();
    if (!id || (action !== "confirm" && action !== "reject")) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const order = await env.DB.prepare("SELECT id, status FROM orders WHERE id = ?").bind(id).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "no_show") return Response.json({ error: "not_no_show" }, { status: 409 });

    if (action === "confirm") {
      await env.DB.prepare(
        "UPDATE orders SET status = 'completed', no_show_review_status = 'confirmed' WHERE id = ?"
      ).bind(id).run();
    } else {
      await env.DB.prepare(
        "UPDATE orders SET no_show_review_status = 'rejected' WHERE id = ?"
      ).bind(id).run();
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
