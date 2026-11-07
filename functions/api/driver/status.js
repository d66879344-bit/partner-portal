import { startTrialIfNeeded } from "../../_lib/trial.js";

// Public, no-login endpoint behind driver.html. Lets the holder of a valid,
// active driver token advance THAT ONE trip to the next stage only — same
// one-step-at-a-time rule as /api/partner/order-stage, just authenticated by
// token instead of a partner session. Reaching the last stage completes the
// order and immediately deactivates the token, so the link stops working the
// moment the trip is done.
const STAGES = ["on_the_way", "arrived", "in_car", "dropped_off"];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const token = (body.token || "").toString().trim();
    const stage = (body.stage || "").toString();
    if (!token || STAGES.indexOf(stage) === -1) return Response.json({ error: "invalid_request" }, { status: 400 });

    const order = await env.DB.prepare(
      "SELECT id, partner_id, status, trip_stage FROM orders WHERE driver_token = ? AND driver_token_active = 1"
    ).bind(token).first();
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "accepted") return Response.json({ error: "not_accepted" }, { status: 409 });

    const currentIndex = order.trip_stage ? STAGES.indexOf(order.trip_stage) : -1;
    const requestedIndex = STAGES.indexOf(stage);
    if (requestedIndex !== currentIndex + 1) {
      return Response.json({ error: "out_of_order" }, { status: 409 });
    }

    if (stage === "dropped_off") {
      await env.DB.prepare(
        "UPDATE orders SET trip_stage = ?, status = 'completed', driver_token_active = 0 WHERE id = ?"
      ).bind(stage, order.id).run();
      await startTrialIfNeeded(env, order.partner_id);
    } else {
      await env.DB.prepare("UPDATE orders SET trip_stage = ? WHERE id = ?").bind(stage, order.id).run();
    }

    return Response.json({ ok: true, stage });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
