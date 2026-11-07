// Public, no-login endpoint behind driver.html. Given a valid, still-active
// driver token, returns ONLY what a driver needs for that one trip — never
// the partner's identity, price, or any other order. An invalid/expired/
// inactive token gets the same generic "not found" response either way, so a
// guess can't distinguish "wrong token" from "token existed but is now dead".
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const url = new URL(request.url);
  const token = (url.searchParams.get("t") || "").trim();
  if (!token) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    const order = await env.DB.prepare(
      `SELECT o.order_number, o.pickup, o.dropoff, o.flight_number, o.flight_time,
              o.order_date, o.order_time, o.vehicle_type, o.passengers, o.luggage,
              o.passenger_name, o.passenger_phone, o.meet_greet, o.sign_text,
              o.status, o.trip_stage, p.language AS partner_language
       FROM orders o
       JOIN partners p ON p.id = o.partner_id
       WHERE o.driver_token = ? AND o.driver_token_active = 1`
    ).bind(token).first();

    if (!order || order.status !== "accepted") return Response.json({ error: "not_found" }, { status: 404 });

    return Response.json({
      ok: true,
      orderNumber: order.order_number,
      pickup: order.pickup,
      dropoff: order.dropoff,
      flightNumber: order.flight_number,
      flightTime: order.flight_time,
      orderDate: order.order_date,
      orderTime: order.order_time,
      vehicleType: order.vehicle_type,
      passengers: order.passengers,
      luggage: order.luggage,
      passengerName: order.passenger_name,
      passengerPhone: order.passenger_phone,
      meetGreet: order.meet_greet,
      signText: order.sign_text,
      tripStage: order.trip_stage,
      lang: order.partner_language || "en",
    });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
