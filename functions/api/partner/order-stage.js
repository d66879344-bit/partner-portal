import { getPartnerId } from "../../_lib/auth.js";

// Trip-progress stages a partner walks an accepted order through, in order.
// Reaching the last one also completes the order.
const STAGES = ["on_the_way", "arrived", "in_car", "dropped_off"];

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const stage = (body.stage || "").toString();
    if (!id || STAGES.indexOf(stage) === -1) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare("SELECT id, partner_id, status, trip_stage FROM orders WHERE id = ?").bind(id).first();
    if (!order || order.partner_id !== partnerId) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "accepted") return Response.json({ error: "not_accepted" }, { status: 409 });

    const currentIndex = order.trip_stage ? STAGES.indexOf(order.trip_stage) : -1;
    const requestedIndex = STAGES.indexOf(stage);
    if (requestedIndex !== currentIndex + 1) {
      return Response.json({ error: "out_of_order" }, { status: 409 });
    }

    if (stage === "dropped_off") {
      await env.DB.prepare("UPDATE orders SET trip_stage = ?, status = 'completed' WHERE id = ?").bind(stage, id).run();
    } else {
      await env.DB.prepare("UPDATE orders SET trip_stage = ? WHERE id = ?").bind(stage, id).run();
    }

    return Response.json({ ok: true, stage });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
