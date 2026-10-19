import { getPartnerId } from "../../_lib/auth.js";

const ALLOWED = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 20 * 1024 * 1024;
const OWNER_TYPES = ["company", "vehicle", "driver", "other", "order"];
// Evidence categories accepted when ownerType === "order" (Customer no-show report).
const ORDER_FIELDS = ["arrive_on_time", "leave_after_wait", "chat_logs", "call_logs", "meet_greet", "other"];

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
    const note = (form.get("note") || "").toString().trim().slice(0, 2000);
    const hasFile = file instanceof File && file.size > 0;

    if (!OWNER_TYPES.includes(ownerType) || !field) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    if (ownerType === "order" && !ORDER_FIELDS.includes(field)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    // Order evidence may be a file OR a written note; every other owner type still requires a file.
    if (ownerType === "order") {
      if (!hasFile && !note) return Response.json({ error: "file_or_note_required" }, { status: 400 });
    } else if (!hasFile) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    let ext = null;
    if (hasFile) {
      if (file.size > MAX_BYTES) return Response.json({ error: "file_too_large" }, { status: 400 });
      ext = ALLOWED[file.type];
      if (!ext) return Response.json({ error: "invalid_type" }, { status: 400 });
    }

    if (ownerType === "vehicle" || ownerType === "driver") {
      if (!ownerId) return Response.json({ error: "owner_required" }, { status: 400 });
      const table = ownerType === "vehicle" ? "vehicles" : "drivers";
      const owner = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND partner_id = ?`).bind(ownerId, partnerId).first();
      if (!owner) return Response.json({ error: "owner_not_found" }, { status: 404 });
    }
    if (ownerType === "order") {
      if (!ownerId) return Response.json({ error: "owner_required" }, { status: 400 });
      const order = await env.DB.prepare("SELECT id FROM orders WHERE id = ? AND partner_id = ?").bind(ownerId, partnerId).first();
      if (!order) return Response.json({ error: "owner_not_found" }, { status: 404 });
    }

    let objectKey = "";
    if (hasFile) {
      objectKey = "partners/" + partnerId + "/" + ownerType + "-" + (ownerId || "x") + "-" + field + "-" + Date.now() + "." + ext;
      await env.BUCKET.put(objectKey, file, { httpMetadata: { contentType: file.type } });
    }

    const r = await env.DB.prepare(
      `INSERT INTO documents (partner_id, owner_type, owner_id, field, label, filename, file_key, content_type, size, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      partnerId, ownerType, ownerId, field, label,
      hasFile ? (file.name || field) : null,
      objectKey,
      hasFile ? file.type : null,
      hasFile ? file.size : null,
      note || null
    ).run();

    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
