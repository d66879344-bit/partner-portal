import { checkAdminSecret } from "../../_lib/auth.js";
import { startTrialIfNeeded } from "../../_lib/trial.js";

const VALID = ["offered", "accepted", "declined", "completed", "cancelled"];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id, partner_id, status FROM orders WHERE id = ?").bind(id).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });

    // Status change (optional — the same endpoint also handles a driver/vehicle reassignment only).
    if (body.status !== undefined) {
      const status = (body.status || "").toString();
      if (VALID.indexOf(status) === -1) return Response.json({ error: "invalid_request" }, { status: 400 });
      await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, id).run();
      if (status === "completed") await startTrialIfNeeded(env, order.partner_id);
    }

    // Driver/vehicle reassignment (optional) — only from this order's own partner's fleet.
    if (body.driverId !== undefined) {
      let driverId = body.driverId ? Number(body.driverId) : null;
      if (driverId) {
        const d = await env.DB.prepare("SELECT id FROM drivers WHERE id = ? AND partner_id = ?").bind(driverId, order.partner_id).first();
        if (!d) driverId = null;
      }
      await env.DB.prepare("UPDATE orders SET driver_id = ? WHERE id = ?").bind(driverId, id).run();
    }
    if (body.vehicleId !== undefined) {
      let vehicleId = body.vehicleId ? Number(body.vehicleId) : null;
      if (vehicleId) {
        const v = await env.DB.prepare("SELECT id FROM vehicles WHERE id = ? AND partner_id = ?").bind(vehicleId, order.partner_id).first();
        if (!v) vehicleId = null;
      }
      await env.DB.prepare("UPDATE orders SET vehicle_id = ? WHERE id = ?").bind(vehicleId, id).run();
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
