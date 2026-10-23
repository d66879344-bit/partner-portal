import { checkAdminSecret } from "../../_lib/auth.js";

// Admin uploads (or replaces) a partner's final, signed-by-both-sides
// contract. Stored as a regular `documents` row with owner_type='contract',
// owner_id=null, field='contract' — the existing generic download endpoints
// (functions/api/partner/file.js, functions/api/admin/partner-file.js) work
// for it unchanged, since they only check partner_id ownership. Replacing an
// existing contract deletes the old documents row (but leaves the old R2
// object in place — harmless, just orphaned) so the partner always sees
// exactly one contract.
const ALLOWED = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_BYTES = 20 * 1024 * 1024;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.BUCKET) return Response.json({ error: "storage_not_configured" }, { status: 500 });

  try {
    const form = await request.formData();
    const partnerId = Number(form.get("partnerId"));
    const file = form.get("file");
    if (!partnerId) return Response.json({ error: "invalid_request" }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return Response.json({ error: "file_required" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "file_too_large" }, { status: 400 });
    const ext = ALLOWED[file.type];
    if (!ext) return Response.json({ error: "invalid_type" }, { status: 400 });

    const partner = await env.DB.prepare("SELECT id FROM partners WHERE id = ?").bind(partnerId).first();
    if (!partner) return Response.json({ error: "owner_not_found" }, { status: 404 });

    await env.DB.prepare("DELETE FROM documents WHERE partner_id = ? AND owner_type = 'contract'").bind(partnerId).run();

    const objectKey = "partners/" + partnerId + "/contract-x-contract-" + Date.now() + "." + ext;
    await env.BUCKET.put(objectKey, file, { httpMetadata: { contentType: file.type } });

    const r = await env.DB.prepare(
      `INSERT INTO documents (partner_id, owner_type, owner_id, field, label, filename, file_key, content_type, size, status)
       VALUES (?, 'contract', NULL, 'contract', 'Signed contract', ?, ?, ?, ?, 'approved')`
    ).bind(partnerId, file.name || "contract", objectKey, file.type, file.size).run();

    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
