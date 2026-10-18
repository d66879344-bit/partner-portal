import { getPartnerId } from "../../_lib/auth.js";

function docShape(d) {
  return {
    id: d.id,
    field: d.field,
    label: d.label || d.field,
    filename: d.filename,
    status: d.status,
    reviewNote: d.review_note,
    uploadedAt: d.uploaded_at,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const [vehiclesRes, driversRes, documentsRes] = await Promise.all([
    env.DB.prepare("SELECT id, plate, category, created_at FROM vehicles WHERE partner_id = ? ORDER BY id ASC").bind(partnerId).all(),
    env.DB.prepare("SELECT id, full_name, created_at FROM drivers WHERE partner_id = ? ORDER BY id ASC").bind(partnerId).all(),
    env.DB.prepare(
      "SELECT id, owner_type, owner_id, field, label, filename, status, review_note, uploaded_at FROM documents WHERE partner_id = ? ORDER BY uploaded_at DESC"
    ).bind(partnerId).all(),
  ]);

  const docs = documentsRes.results || [];
  const byOwner = (type, id) => docs.filter((d) => d.owner_type === type && (id == null ? d.owner_id == null : d.owner_id === id)).map(docShape);

  const vehicles = (vehiclesRes.results || []).map((v) => ({
    id: v.id,
    plate: v.plate,
    category: v.category,
    documents: byOwner("vehicle", v.id),
  }));
  const drivers = (driversRes.results || []).map((d) => ({
    id: d.id,
    fullName: d.full_name,
    documents: byOwner("driver", d.id),
  }));

  return Response.json({
    ok: true,
    company: { documents: byOwner("company", null) },
    other: { documents: byOwner("other", null) },
    vehicles,
    drivers,
  });
}
