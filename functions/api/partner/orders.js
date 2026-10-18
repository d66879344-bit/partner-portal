import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const { results } = await env.DB.prepare(
    `SELECT id, pickup, dropoff, order_date, order_time, vehicle_type, passengers, price, currency, notes, status, created_at, responded_at
     FROM orders WHERE partner_id = ? ORDER BY order_date ASC, order_time ASC`
  ).bind(partnerId).all();

  const orders = (results || []).map((o) => ({
    id: o.id,
    pickup: o.pickup,
    dropoff: o.dropoff,
    orderDate: o.order_date,
    orderTime: o.order_time,
    vehicleType: o.vehicle_type,
    passengers: o.passengers,
    price: o.price,
    currency: o.currency,
    notes: o.notes,
    status: o.status,
    createdAt: o.created_at,
    respondedAt: o.responded_at,
  }));

  return Response.json({ ok: true, orders });
}
