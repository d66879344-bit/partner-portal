import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.order_number, o.pickup, o.dropoff, o.flight_number, o.flight_time, o.buffer_minutes,
            o.order_date, o.order_time, o.vehicle_type,
            o.passengers, o.luggage, o.passenger_name, o.passenger_phone, o.meet_greet, o.sign_text,
            o.driver_id, dr.full_name AS driver_name, o.vehicle_id, v.plate AS vehicle_plate,
            o.price, o.currency, o.notes, o.status, o.trip_stage, o.no_show_type, o.no_show_at, o.created_at, o.responded_at
     FROM orders o
     LEFT JOIN drivers dr ON dr.id = o.driver_id
     LEFT JOIN vehicles v ON v.id = o.vehicle_id
     WHERE o.partner_id = ? AND o.status NOT IN ('declined', 'cancelled')
     ORDER BY o.order_date ASC, o.order_time ASC`
  ).bind(partnerId).all();

  const closedRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE partner_id = ? AND status IN ('declined', 'cancelled')"
  ).bind(partnerId).first();

  const orders = (results || []).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    pickup: o.pickup,
    dropoff: o.dropoff,
    flightNumber: o.flight_number,
    flightTime: o.flight_time,
    bufferMinutes: o.buffer_minutes,
    orderDate: o.order_date,
    orderTime: o.order_time,
    vehicleType: o.vehicle_type,
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
    createdAt: o.created_at,
    respondedAt: o.responded_at,
  }));

  return Response.json({ ok: true, orders, declinedCount: closedRow ? closedRow.n : 0 });
}
