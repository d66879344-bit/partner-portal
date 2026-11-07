import { getPartnerId } from "../../_lib/auth.js";
import { generateDriverToken } from "../../_lib/driver-token.js";

// Creates (or returns the existing) no-login driver link for one of the
// partner's own accepted orders. The link lets a driver view just that trip
// (route, time, passenger contact) and advance its status — nothing else.
// Idempotent: calling this again for the same order while the link is still
// active returns the SAME token rather than invalidating a link already
// handed to a driver.
export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare(
      "SELECT id, partner_id, status, driver_token, driver_token_active FROM orders WHERE id = ?"
    ).bind(id).first();
    if (!order || order.partner_id !== partnerId) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "accepted") return Response.json({ error: "not_accepted" }, { status: 409 });

    let token = order.driver_token_active ? order.driver_token : null;
    if (!token) {
      token = generateDriverToken();
      await env.DB.prepare(
        "UPDATE orders SET driver_token = ?, driver_token_active = 1 WHERE id = ?"
      ).bind(token, id).run();
    }

    return Response.json({ ok: true, token: token });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
