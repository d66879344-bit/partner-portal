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

// Aggregate review status for a vehicle/driver from its own documents only
// (ignores slots that are required but have no document yet, so a brand new
// vehicle/driver without any uploads shows as "pending" rather than "rejected").
function aggregateStatus(docs) {
  if (!docs.length) return "pending";
  if (docs.some((d) => d.status === "rejected")) return "rejected";
  if (docs.every((d) => d.status === "approved")) return "approved";
  return "pending";
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const [vehiclesRes, driversRes, documentsRes] = await Promise.all([
    env.DB.prepare("SELECT id, plate, category, make, created_at FROM vehicles WHERE partner_id = ? ORDER BY id ASC").bind(partnerId).all(),
    env.DB.prepare("SELECT id, full_name, phone, language, created_at FROM drivers WHERE partner_id = ? ORDER BY id ASC").bind(partnerId).all(),
    env.DB.prepare(
      "SELECT id, owner_type, owner_id, field, label, filename, status, review_note, uploaded_at FROM documents WHERE partner_id = ? ORDER BY uploaded_at DESC"
    ).bind(partnerId).all(),
  ]);

  const docs = documentsRes.results || [];
  const byOwner = (type, id) => docs.filter((d) => d.owner_type === type && (id == null ? d.owner_id == null : d.owner_id === id)).map(docShape);

  const vehicles = (vehiclesRes.results || []).map((v) => {
    const vdocs = byOwner("vehicle", v.id);
    return {
      id: v.id,
      plate: v.plate,
      category: v.category,
      make: v.make,
      documents: vdocs,
      status: aggregateStatus(vdocs),
    };
  });
  const drivers = (driversRes.results || []).map((d) => {
    const ddocs = byOwner("driver", d.id);
    return {
      id: d.id,
      fullName: d.full_name,
      phone: d.phone,
      language: d.language,
      documents: ddocs,
      status: aggregateStatus(ddocs),
    };
  });

  return Response.json({
    ok: true,
    company: { documents: byOwner("company", null) },
    other: { documents: byOwner("other", null) },
    contract: { documents: byOwner("contract", null) },
    vehicles,
    drivers,
  });
}
