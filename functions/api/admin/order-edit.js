import { checkAdminSecret } from "../../_lib/auth.js";
import { notifyText, orderChangesMessage, flightTimeChangedMessage } from "../../_lib/whatsapp.js";
import { buildChanges, withinWindow } from "../../_lib/order-changes.js";
import { ensureFlightColumns, computePickupManual, WHATSAPP_ON_FLIGHT_CHANGE } from "../../_lib/flight-track.js";

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

    const order = await env.DB.prepare(
      "SELECT id, partner_id, status, flight_time, pickup, dropoff, order_date, order_time, price, currency, passenger_name, passenger_phone FROM orders WHERE id = ?"
    ).bind(id).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });

    const orderNumber = (body.orderNumber || "").toString().trim().slice(0, 40);
    const adminNumber = (body.adminNumber || "").toString().trim().slice(0, 40);
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
    let vehiclesNeeded = body.vehiclesNeeded ? Number(body.vehiclesNeeded) : 1;
    if (!Number.isFinite(vehiclesNeeded) || vehiclesNeeded < 1) vehiclesNeeded = 1;
    vehiclesNeeded = Math.min(Math.round(vehiclesNeeded), 20);
    const passengers = body.passengers ? Number(body.passengers) : null;
    const luggage = body.luggage ? Number(body.luggage) : null;
    const passengerName = (body.passengerName || "").toString().trim().slice(0, 120);
    const passengerPhone = (body.passengerPhone || "").toString().trim().slice(0, 40);
    const meetGreet = (body.meetGreet || "").toString().trim().slice(0, 500);
    const price = (body.price || "").toString().trim().slice(0, 30);
    const currency = (body.currency || "EUR").toString().trim().slice(0, 10) || "EUR";
    const notes = (body.notes || "").toString().trim().slice(0, 1000);

    // admin_number is a newer column (added by migration-admin-order-number.sql);
    // fall back to updating without it if that migration hasn't been applied yet.
    try {
      await env.DB.prepare(
        `UPDATE orders SET
           order_number = ?, admin_number = ?, pickup = ?, dropoff = ?, flight_number = ?, flight_time = ?, buffer_minutes = ?,
           order_date = ?, order_time = ?, vehicle_type = ?, vehicles_needed = ?, passengers = ?, luggage = ?,
           passenger_name = ?, passenger_phone = ?, meet_greet = ?, price = ?, currency = ?, notes = ?
         WHERE id = ?`
      ).bind(
        orderNumber, adminNumber || null, pickup, dropoff, flightNumber, flightTime, bufferMinutes,
        orderDate, orderTime, vehicleType, vehiclesNeeded, passengers, luggage,
        passengerName, passengerPhone, meetGreet, price, currency, notes,
        id
      ).run();
    } catch (e) {
      await env.DB.prepare(
        `UPDATE orders SET
           order_number = ?, pickup = ?, dropoff = ?, flight_number = ?, flight_time = ?, buffer_minutes = ?,
           order_date = ?, order_time = ?, vehicle_type = ?, vehicles_needed = ?, passengers = ?, luggage = ?,
           passenger_name = ?, passenger_phone = ?, meet_greet = ?, price = ?, currency = ?, notes = ?
         WHERE id = ?`
      ).bind(
        orderNumber, pickup, dropoff, flightNumber, flightTime, bufferMinutes,
        orderDate, orderTime, vehicleType, vehiclesNeeded, passengers, luggage,
        passengerName, passengerPhone, meetGreet, price, currency, notes,
        id
      ).run();
    }

    // Buffer time (flight arrival -> pickup) and whether the pickup was typed by hand.
    try {
      await ensureFlightColumns(env.DB);
      const fb = body.flightBufferMinutes !== undefined && body.flightBufferMinutes !== "" && body.flightBufferMinutes !== null && Number.isFinite(Number(body.flightBufferMinutes))
        ? Math.max(0, Math.min(Math.round(Number(body.flightBufferMinutes)), 1440)) : null;
      await env.DB.prepare("UPDATE orders SET flight_buffer_minutes = ?, pickup_manual = ? WHERE id = ?")
        .bind(fb, computePickupManual(flightTime, fb, orderTime), id).run();
    } catch (e) {}

    // WhatsApp: tell the partner's group what changed - but only when the trip is
    // close (pickup within 4 h, London time) and the partner can actually see the
    // order (offered or accepted). Earlier edits are saved quietly to avoid spam.
    // The flight arrival time (and the pickup shift it causes) is never sent to the
    // group - it shows up only on the driver link.
    const S = (v) => (v == null ? "" : String(v).trim());
    const flightChanged = S(order.flight_time) !== "" && S(flightTime) !== "" && S(order.flight_time) !== S(flightTime);
    if (order.status === "offered" || order.status === "accepted") {
      const lines = buildChanges(
        order,
        { order_date: orderDate, order_time: orderTime, pickup, dropoff, price, currency, passenger_name: passengerName, passenger_phone: passengerPhone },
        { flightChanged }
      );
      const close = withinWindow(order.order_date, order.order_time, orderDate, orderTime);
      if (lines.length && close) {
        notifyText(context, order.partner_id, orderChangesMessage(orderNumber, lines));
      } else if (!lines.length && flightChanged && WHATSAPP_ON_FLIGHT_CHANGE && close) {
        notifyText(context, order.partner_id, flightTimeChangedMessage(orderNumber));
      }
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
