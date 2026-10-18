import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const fullName = (body.fullName || "").toString().trim().slice(0, 150);
    const phone = (body.phone || "").toString().trim().slice(0, 50);
    const language = (body.language || "").toString().trim().slice(0, 50);
    if (!fullName) return Response.json({ error: "name_required" }, { status: 400 });
    const r = await env.DB.prepare("INSERT INTO drivers (partner_id, full_name, phone, language) VALUES (?, ?, ?, ?)")
      .bind(partnerId, fullName, phone, language).run();
    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
