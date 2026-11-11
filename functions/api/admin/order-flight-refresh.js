import { checkAdminSecret } from "../../_lib/auth.js";
import { ensureFlightColumns, trackOrder } from "../../_lib/flight-track.js";

// "Refresh flight" button in the admin order view: looks the flight up right now.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.AERODATABOX_KEY) return Response.json({ error: "flight_not_configured" }, { status: 400 });
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });
    await ensureFlightColumns(env.DB);
    const order = await env.DB.prepare(
      `SELECT id, order_number, flight_number, flight_time, flight_buffer_minutes, pickup_manual, order_date, order_time
       FROM orders WHERE id = ?`
    ).bind(id).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });
    if (!order.flight_number || !String(order.flight_number).trim()) return Response.json({ error: "no_flight_number" }, { status: 400 });
    const r = await trackOrder(env, order);
    if (!r.ok) return Response.json({ error: "flight_api_error", detail: r.error }, { status: 502 });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
