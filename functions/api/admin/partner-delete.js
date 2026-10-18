import { checkAdminSecret } from "../../_lib/auth.js";

// Permanently deletes a partner and everything that belongs to them: their uploaded
// document files in R2, and the documents/vehicles/drivers/orders rows in D1, then the
// partner row itself. Used for cleaning up test data. Irreversible.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const partner = await env.DB.prepare("SELECT id FROM partners WHERE id = ?").bind(id).first();
    if (!partner) return Response.json({ error: "not_found" }, { status: 404 });

    const docsRes = await env.DB.prepare("SELECT file_key FROM documents WHERE partner_id = ?").bind(id).all();
    const keys = (docsRes.results || []).map((d) => d.file_key).filter(Boolean);
    if (keys.length && env.BUCKET) {
      try {
        await env.BUCKET.delete(keys);
      } catch (e) {
        // Best-effort: don't let a storage hiccup block the database cleanup.
      }
    }

    await env.DB.batch([
      env.DB.prepare("DELETE FROM documents WHERE partner_id = ?").bind(id),
      env.DB.prepare("DELETE FROM vehicles WHERE partner_id = ?").bind(id),
      env.DB.prepare("DELETE FROM drivers WHERE partner_id = ?").bind(id),
      env.DB.prepare("DELETE FROM orders WHERE partner_id = ?").bind(id),
      env.DB.prepare("DELETE FROM partners WHERE id = ?").bind(id),
    ]);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
