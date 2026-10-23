import { checkAdminSecret } from "../../_lib/auth.js";

// Admin moves an invoice through its status lifecycle.
const STATUSES = ["generated", "sent", "received", "processing", "paid"];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const status = (body.status || "").toString().trim();
    if (!id || STATUSES.indexOf(status) === -1) return Response.json({ error: "invalid_request" }, { status: 400 });

    await env.DB.prepare("UPDATE invoices SET status = ?, status_updated_at = datetime('now') WHERE id = ?")
      .bind(status, id)
      .run();
    return Response.json({ ok: true, status });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
