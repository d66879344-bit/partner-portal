import { getPartnerId } from "../../_lib/auth.js";

// Lists the Customer-no-show evidence documents (uploaded via /api/partner/documents
// with ownerType=order) attached to one of the partner's own orders.
export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const url = new URL(request.url);
  const orderId = Number(url.searchParams.get("id"));
  if (!orderId) return Response.json({ error: "invalid_request" }, { status: 400 });

  const order = await env.DB.prepare("SELECT id FROM orders WHERE id = ? AND partner_id = ?").bind(orderId, partnerId).first();
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });

  const { results } = await env.DB.prepare(
    `SELECT id, field, label, filename, file_key, note, status, review_note, uploaded_at
     FROM documents WHERE partner_id = ? AND owner_type = 'order' AND owner_id = ?
     ORDER BY uploaded_at DESC`
  ).bind(partnerId, orderId).all();

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
