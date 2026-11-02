import { checkAdminSecret } from "../../_lib/auth.js";
import { buildPassengersXlsx } from "../../_lib/xlsx.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const url = new URL(request.url);
  const city = (url.searchParams.get("city") || "").trim();
  const from = (url.searchParams.get("from") || "").trim();
  const to = (url.searchParams.get("to") || "").trim();

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.passenger_name, o.passenger_phone, o.order_date, o.order_number,
            o.partner_id, p.company_name, p.service_city
     FROM orders o
     JOIN partners p ON p.id = o.partner_id
     WHERE o.hidden_from_admin = 0 AND o.passenger_name IS NOT NULL AND TRIM(o.passenger_name) != ''
     ORDER BY o.order_date DESC, o.id DESC`
  ).all();

  let passengers = (results || []).map((r) => ({
    name: r.passenger_name,
    phone: r.passenger_phone,
    city: r.service_city || "",
    tripDate: r.order_date,
    orderNumber: r.order_number || r.id,
    companyName: r.company_name,
  }));

  if (city) passengers = passengers.filter((p) => p.city === city);
  if (from) passengers = passengers.filter((p) => p.tripDate && p.tripDate >= from);
  if (to) passengers = passengers.filter((p) => p.tripDate && p.tripDate <= to);

  const bytes = buildPassengersXlsx(passengers);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="passengers.xlsx"',
    },
  });
}
