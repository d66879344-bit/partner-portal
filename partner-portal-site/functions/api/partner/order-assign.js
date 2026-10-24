import { getPartnerId } from "../../_lib/auth.js";

// Lets a partner set/clear which of their OWN drivers and vehicles is handling one of
// their own orders. Does not touch order status.
export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id, partner_id FROM orders WHERE id = ?").bind(id).first();
    if (!order || order.partner_id !== partnerId) return Response.json({ error: "not_found" }, { status: 404 });

    if (body.driverId !== undefined) {
      let driverId = body.driverId ? Number(body.driverId) : null;
      if (driverId) {
        const d = await env.DB.prepare("SELECT id FROM drivers WHERE id = ? AND partner_id = ?").bind(driverId, partnerId).first();
        if (!d) return Response.json({ error: "invalid_driver" }, { status: 400 });
      }
      await env.DB.prepare("UPDATE orders SET driver_id = ? WHERE id = ?").bind(driverId, id).run();
    }
    if (body.vehicleId !== undefined) {
      let vehicleId = body.vehicleId ? Number(body.vehicleId) : null;
      if (vehicleId) {
        const v = await env.DB.prepare("SELECT id FROM vehicles WHERE id = ? AND partner_id = ?").bind(vehicleId, partnerId).first();
        if (!v) return Response.json({ error: "invalid_vehicle" }, { status: 400 });
      }
      await env.DB.prepare("UPDATE orders SET vehicle_id = ? WHERE id = ?").bind(vehicleId, id).run();
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
