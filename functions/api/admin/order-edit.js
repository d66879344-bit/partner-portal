import { checkAdminSecret } from "../../_lib/auth.js";

// Edits an order's trip details in place, regardless of its current status —
// new, accepted, completed, declined, cancelled, no-show, anything. This never
// creates a new order and never touches status, trip stage, partner, driver or
// vehicle assignment; those stay exactly as they were. It's purely for
// correcting/updating the details of an existing order after the fact.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id FROM orders WHERE id = ?").bind(id).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });

    const orderNumber = (body.orderNumber || "").toString().trim().slice(0, 40);
    const pickup = (body.pickup || "").toString().trim().slice(0, 200);
    const dropoff = (body.dropoff || "").toString().trim().slice(0, 200);
    const orderDate = (body.orderDate || "").toString().trim().slice(0, 20);
    if (!orderNumber || !pickup || !dropoff || !orderDate) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const dup = await env.DB.prepare("SELECT id FROM orders WHERE order_number = ? AND id != ?").bind(orderNumber, id).first();
    if (dup) return Response.json({ error: "order_number_taken" }, { status: 409 });

    const flightNumber = (body.flightNumber || "").toString().trim().slice(0, 30);
    const flightTime = (body.flightTime || "").toString().trim().slice(0, 10);
    const bufferMinutes = body.bufferMinutes ? Number(body.bufferMinutes) : null;
    const orderTime = (body.orderTime || "").toString().trim().slice(0, 10);
    const vehicleType = (body.vehicleType || "").toString().trim().slice(0, 80);
    const passengers = body.passengers ? Number(body.passengers) : null;
    const luggage = body.luggage ? Number(body.luggage) : null;
    const passengerName = (body.passengerName || "").toString().trim().slice(0, 120);
    const passengerPhone = (body.passengerPhone || "").toString().trim().slice(0, 40);
    const meetGreet = (body.meetGreet || "").toString().trim().slice(0, 500);
    const price = (body.price || "").toString().trim().slice(0, 30);
    const currency = (body.currency || "EUR").toString().trim().slice(0, 10) || "EUR";
    const notes = (body.notes || "").toString().trim().slice(0, 1000);

    await env.DB.prepare(
      `UPDATE orders SET
         order_number = ?, pickup = ?, dropoff = ?, flight_number = ?, flight_time = ?, buffer_minutes = ?,
         order_date = ?, order_time = ?, vehicle_type = ?, passengers = ?, luggage = ?,
         passenger_name = ?, passenger_phone = ?, meet_greet = ?, price = ?, currency = ?, notes = ?
       WHERE id = ?`
    ).bind(
      orderNumber, pickup, dropoff, flightNumber, flightTime, bufferMinutes,
      orderDate, orderTime, vehicleType, passengers, luggage,
      passengerName, passengerPhone, meetGreet, price, currency, notes,
      id
    ).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
