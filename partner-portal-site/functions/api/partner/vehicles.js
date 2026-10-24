import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const plate = (body.plate || "").toString().trim().slice(0, 50);
    const category = (body.category || "").toString().trim().slice(0, 50);
    const make = (body.make || "").toString().trim().slice(0, 100);
    if (!plate) return Response.json({ error: "plate_required" }, { status: 400 });
    const r = await env.DB.prepare("INSERT INTO vehicles (partner_id, plate, category, make) VALUES (?, ?, ?, ?)")
      .bind(partnerId, plate, category, make).run();
    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
