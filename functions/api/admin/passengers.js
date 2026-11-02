import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.passenger_name, o.passenger_phone, o.order_date, o.order_number,
            o.partner_id, p.company_name, p.service_city
     FROM orders o
     JOIN partners p ON p.id = o.partner_id
     WHERE o.hidden_from_admin = 0 AND o.passenger_name IS NOT NULL AND TRIM(o.passenger_name) != ''
     ORDER BY o.order_date DESC, o.id DESC`
  ).all();

  const passengers = (results || []).map((r) => ({
    id: r.id,
    name: r.passenger_name,
    phone: r.passenger_phone,
    city: r.service_city || "",
    tripDate: r.order_date,
    orderNumber: r.order_number || r.id,
    partnerId: r.partner_id,
    companyName: r.company_name,
  }));

  return Response.json({ ok: true, passengers });
}
