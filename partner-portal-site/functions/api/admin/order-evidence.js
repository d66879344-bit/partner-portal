import { checkAdminSecret } from "../../_lib/auth.js";

// Lists the Customer-no-show evidence a partner uploaded for one order
// (documents with owner_type='order'), for admin review. Files themselves
// are served by /api/admin/partner-file?id=<document id> (owner-agnostic).
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const url = new URL(request.url);
  const orderId = Number(url.searchParams.get("id"));
  if (!orderId) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { results } = await env.DB.prepare(
    `SELECT id, field, label, filename, file_key, note, status, review_note, uploaded_at
     FROM documents WHERE owner_type = 'order' AND owner_id = ?
     ORDER BY uploaded_at ASC`
  ).bind(orderId).all();

  const documents = (results || []).map((d) => ({
    id: d.id,
    field: d.field,
    label: d.label,
    filename: d.filename,
    hasFile: !!d.file_key,
    note: d.note,
    status: d.status,
    reviewNote: d.review_note,
    uploadedAt: d.uploaded_at,
  }));

  return Response.json({ ok: true, documents });
}
