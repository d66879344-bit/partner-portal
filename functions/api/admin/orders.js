import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.partner_id, p.company_name, o.pickup, o.dropoff, o.order_date, o.order_time, o.vehicle_type,
            o.passengers, o.price, o.currency, o.notes, o.status, o.created_at, o.responded_at
     FROM orders o JOIN partners p ON p.id = o.partner_id
     ORDER BY o.order_date DESC, o.order_time DESC`
  ).all();

  const orders = (results || []).map((o) => ({
    id: o.id,
    partnerId: o.partner_id,
    companyName: o.company_name,
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

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const partnerId = Number(body.partnerId);
    const pickup = (body.pickup || "").toString().trim().slice(0, 200);
    const dropoff = (body.dropoff || "").toString().trim().slice(0, 200);
    const orderDate = (body.orderDate || "").toString().trim().slice(0, 20);
    const orderTime = (body.orderTime || "").toString().trim().slice(0, 10);
    const vehicleType = (body.vehicleType || "").toString().trim().slice(0, 80);
    const passengers = body.passengers ? Number(body.passengers) : null;
    const price = (body.price || "").toString().trim().slice(0, 30);
    const currency = (body.currency || "EUR").toString().trim().slice(0, 10) || "EUR";
    const notes = (body.notes || "").toString().trim().slice(0, 1000);

    if (!partnerId || !pickup || !dropoff || !orderDate) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const partner = await env.DB.prepare("SELECT id, status FROM partners WHERE id = ?").bind(partnerId).first();
    if (!partner) return Response.json({ error: "partner_not_found" }, { status: 404 });
    if (partner.status !== "active") return Response.json({ error: "partner_not_active" }, { status: 409 });

    const r = await env.DB.prepare(
      `INSERT INTO orders (partner_id, pickup, dropoff, order_date, order_time, vehicle_type, passengers, price, currency, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered')`
    ).bind(partnerId, pickup, dropoff, orderDate, orderTime, vehicleType, passengers, price, currency, notes).run();

    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
