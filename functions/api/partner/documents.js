import { getPartnerId } from "../../_lib/auth.js";

const ALLOWED = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 20 * 1024 * 1024;
const OWNER_TYPES = ["company", "vehicle", "driver", "other"];

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.BUCKET) return Response.json({ error: "storage_not_configured" }, { status: 500 });

  try {
    const form = await request.formData();
    const ownerType = (form.get("ownerType") || "").toString();
    const ownerIdRaw = form.get("ownerId");
    const ownerId = ownerIdRaw ? Number(ownerIdRaw) : null;
    const field = (form.get("field") || "").toString().trim().slice(0, 80);
    const label = (form.get("label") || field).toString().trim().slice(0, 150);
    const file = form.get("file");

    if (!OWNER_TYPES.includes(ownerType) || !field || !(file instanceof File)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    if (!file.size) return Response.json({ error: "empty_file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "file_too_large" }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return Response.json({ error: "invalid_type" }, { status: 400 });

    if (ownerType === "vehicle" || ownerType === "driver") {
      if (!ownerId) return Response.json({ error: "owner_required" }, { status: 400 });
      const table = ownerType === "vehicle" ? "vehicles" : "drivers";
      const owner = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND partner_id = ?`).bind(ownerId, partnerId).first();
      if (!owner) return Response.json({ error: "owner_not_found" }, { status: 404 });
    }

    const objectKey = "partners/" + partnerId + "/" + ownerType + "-" + (ownerId || "x") + "-" + field + "-" + Date.now() + "." + ext;
    await env.BUCKET.put(objectKey, file, { httpMetadata: { contentType: file.type } });

    const r = await env.DB.prepare(
      `INSERT INTO documents (partner_id, owner_type, owner_id, field, label, filename, file_key, content_type, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(partnerId, ownerType, ownerId, field, label, file.name || field, objectKey, file.type, file.size).run();

    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
