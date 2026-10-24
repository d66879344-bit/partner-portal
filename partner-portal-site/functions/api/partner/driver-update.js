import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });
    const fullName = (body.fullName || "").toString().trim().slice(0, 150);
    const phone = (body.phone || "").toString().trim().slice(0, 50);
    const language = (body.language || "").toString().trim().slice(0, 50);
    if (!fullName) return Response.json({ error: "name_required" }, { status: 400 });

    const owner = await env.DB.prepare("SELECT id FROM drivers WHERE id = ? AND partner_id = ?").bind(id, partnerId).first();
    if (!owner) return Response.json({ error: "not_found" }, { status: 404 });

    await env.DB.prepare("UPDATE drivers SET full_name = ?, phone = ?, language = ? WHERE id = ?").bind(fullName, phone, language, id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
