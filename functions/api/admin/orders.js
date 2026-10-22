import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.order_number, o.partner_id, p.company_name, o.pickup, o.dropoff, o.flight_number, o.flight_time,
            o.buffer_minutes, o.order_date, o.order_time,
            o.vehicle_type, o.vehicles_needed, o.passengers, o.luggage, o.passenger_name, o.passenger_phone, o.meet_greet, o.sign_text,
            o.driver_id, dr.full_name AS driver_name, o.vehicle_id, v.plate AS vehicle_plate,
            o.price, o.currency, o.notes, o.status, o.trip_stage, o.no_show_type, o.no_show_at, o.no_show_review_status,
            o.created_at, o.responded_at
     FROM orders o
     JOIN partners p ON p.id = o.partner_id
     LEFT JOIN drivers dr ON dr.id = o.driver_id
     LEFT JOIN vehicles v ON v.id = o.vehicle_id
     WHERE o.hidden_from_admin = 0
     ORDER BY o.order_date DESC, o.order_time DESC`
  ).all();

  const orders = (results || []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    partnerId: o.partner_id,
    companyName: o.company_name,
    pickup: o.pickup,
    dropoff: o.dropoff,
    flightNumber: o.flight_number,
    flightTime: o.flight_time,
    bufferMinutes: o.buffer_minutes,
    orderDate: o.order_date,
    orderTime: o.order_time,
    vehicleType: o.vehicle_type,
    vehiclesNeeded: o.vehicles_needed != null ? o.vehicles_needed : 1,
    passengers: o.passengers,
    luggage: o.luggage,
    passengerName: o.passenger_name,
    passengerPhone: o.passenger_phone,
    meetGreet: o.meet_greet,
    signText: o.sign_text,
    driverId: o.driver_id,
    driverName: o.driver_name,
    vehicleId: o.vehicle_id,
    vehiclePlate: o.vehicle_plate,
    price: o.price,
    currency: o.currency,
    notes: o.notes,
    status: o.status,
    tripStage: o.trip_stage,
    noShowType: o.no_show_type,
    noShowAt: o.no_show_at,
    noShowReviewStatus: o.no_show_review_status,
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
    const orderNumber = (body.orderNumber || "").toString().trim().slice(0, 40);
    const pickup = (body.pickup || "").toString().trim().slice(0, 200);
    const dropoff = (body.dropoff || "").toString().trim().slice(0, 200);
    const flightNumber = (body.flightNumber || "").toString().trim().slice(0, 30);
    const flightTime = (body.flightTime || "").toString().trim().slice(0, 10);
    const bufferMinutes = body.bufferMinutes ? Number(body.bufferMinutes) : null;
    const orderDate = (body.orderDate || "").toString().trim().slice(0, 20);
    const orderTime = (body.orderTime || "").toString().trim().slice(0, 10);
    const vehicleType = (body.vehicleType || "").toString().trim().slice(0, 80);
    let vehiclesNeeded = body.vehiclesNeeded ? Number(body.vehiclesNeeded) : 1;
    if (!Number.isFinite(vehiclesNeeded) || vehiclesNeeded < 1) vehiclesNeeded = 1;
    vehiclesNeeded = Math.min(Math.round(vehiclesNeeded), 20);
    const passengers = body.passengers ? Number(body.passengers) : null;
    const luggage = body.luggage ? Number(body.luggage) : null;
    const passengerName = (body.passengerName || "").toString().trim().slice(0, 120);
    const passengerPhone = (body.passengerPhone || "").toString().trim().slice(0, 40);
    const meetGreet = (body.meetGreet || "").toString().trim().slice(0, 500);
    const signText = (body.signText || "").toString().trim().slice(0, 200);
    const price = (body.price || "").toString().trim().slice(0, 30);
    const currency = (body.currency || "EUR").toString().trim().slice(0, 10) || "EUR";
    const notes = (body.notes || "").toString().trim().slice(0, 1000);
    let driverId = body.driverId ? Number(body.driverId) : null;
    let vehicleId = body.vehicleId ? Number(body.vehicleId) : null;

    if (!partnerId || !orderNumber || !pickup || !dropoff || !orderDate) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const dup = await env.DB.prepare("SELECT id FROM orders WHERE order_number = ?").bind(orderNumber).first();
    if (dup) return Response.json({ error: "order_number_taken" }, { status: 409 });

    const partner = await env.DB.prepare("SELECT id, status FROM partners WHERE id = ?").bind(partnerId).first();
    if (!partner) return Response.json({ error: "partner_not_found" }, { status: 404 });
    if (partner.status !== "active") return Response.json({ error: "partner_not_active" }, { status: 409 });

    // A driver/vehicle, if given, must belong to this same partner.
    if (driverId) {
      const d = await env.DB.prepare("SELECT id FROM drivers WHERE id = ? AND partner_id = ?").bind(driverId, partnerId).first();
      if (!d) driverId = null;
    }
    if (vehicleId) {
      const v = await env.DB.prepare("SELECT id FROM vehicles WHERE id = ? AND partner_id = ?").bind(vehicleId, partnerId).first();
      if (!v) vehicleId = null;
    }

    const r = await env.DB.prepare(
      `INSERT INTO orders (order_number, partner_id, pickup, dropoff, flight_number, flight_time, buffer_minutes,
                            order_date, order_time, vehicle_type, vehicles_needed,
                            passengers, luggage, passenger_name, passenger_phone, meet_greet, sign_text, driver_id, vehicle_id,
                            price, currency, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'offered')`
    ).bind(
      orderNumber, partnerId, pickup, dropoff, flightNumber, flightTime, bufferMinutes,
      orderDate, orderTime, vehicleType, vehiclesNeeded,
      passengers, luggage, passengerName, passengerPhone, meetGreet, signText, driverId, vehicleId,
      price, currency, notes
    ).run();

    return Response.json({ ok: true, id: r.meta.last_row_id });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
