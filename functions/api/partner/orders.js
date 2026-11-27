import { ensureLateCancelColumn } from "../../_lib/late-cancel.js";
import { getPartnerId } from "../../_lib/auth.js";
import { ensureCompletedColumn } from "../../_lib/contact-lock.js";
import { getHidePassengerData, passengerDataHidden } from "../../_lib/partner-privacy.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  await ensureCompletedColumn(env.DB);
  const lateCancelOk = await ensureLateCancelColumn(env.DB);
  const hideFlag = await getHidePassengerData(env.DB, partnerId);
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.order_number, o.pickup, o.dropoff, o.flight_number, o.flight_time, o.buffer_minutes,
            o.order_date, o.order_time, o.vehicle_type, o.vehicles_needed,
            o.passengers, o.luggage, o.passenger_name, o.passenger_phone, o.meet_greet, o.sign_text,
            o.driver_id, dr.full_name AS driver_name, o.vehicle_id, v.plate AS vehicle_plate,
            o.price, o.currency, o.notes, o.status, o.trip_stage, o.no_show_type, o.no_show_at, o.no_show_review_status, o.created_at, o.responded_at, o.completed_at${lateCancelOk ? ", o.late_cancel" : ""}
     FROM orders o
     LEFT JOIN drivers dr ON dr.id = o.driver_id
     LEFT JOIN vehicles v ON v.id = o.vehicle_id
     WHERE o.partner_id = ? AND o.status NOT IN ('declined', 'cancelled', 'draft')
     ORDER BY o.order_date ASC, o.order_time ASC`
  ).bind(partnerId).all();

  const closedRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE partner_id = ? AND status IN ('declined', 'cancelled')"
  ).bind(partnerId).first();

  const orders = (results || []).map((o) => {
    // When the admin has switched it on for this partner, completed trips no longer carry the passenger's contacts.
    const hidden = passengerDataHidden(hideFlag, o);
    return {
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
    vehiclesNeeded: o.vehicles_needed != null ? o.vehicles_needed : 1,
    passengers: o.passengers,
    luggage: o.luggage,
    passengerName: hidden ? null : o.passenger_name,
    passengerPhone: hidden ? null : o.passenger_phone,
    meetGreet: hidden ? null : o.meet_greet,
    signText: hidden ? null : o.sign_text,
    contactsHidden: hidden,
    driverId: o.driver_id,
    driverName: o.driver_name,
    vehicleId: o.vehicle_id,
    vehiclePlate: o.vehicle_plate,
    price: o.price,
    currency: o.currency,
    notes: hidden ? null : o.notes,
    status: o.status,
    tripStage: o.trip_stage,
    noShowType: o.no_show_type,
    noShowAt: o.no_show_at,
    noShowReviewStatus: o.no_show_review_status,
    lateCancel: !!o.late_cancel,
    createdAt: o.created_at,
    respondedAt: o.responded_at,
    };
  });

  return Response.json({ ok: true, orders, declinedCount: closedRow ? closedRow.n : 0 });
}
