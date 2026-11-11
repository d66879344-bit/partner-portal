import { checkAdminSecret } from "../../_lib/auth.js";
import { ensureFlightColumns, dueOrders, trackOrder } from "../../_lib/flight-track.js";

// Called on a schedule (every ~15 minutes, see flight-cron-worker.js).
// Checks only the orders whose flight is due for a look, one at a time.
// POST or GET with ?secret=<ADMIN_SECRET>.
export async function onRequest(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.AERODATABOX_KEY) return Response.json({ error: "flight_not_configured" }, { status: 400 });
  try {
    await ensureFlightColumns(env.DB);
    const due = await dueOrders(env.DB, 12);
    const out = [];
    for (const o of due) {
      try {
        const r = await trackOrder(env, o);
        out.push({ id: o.id, order: o.order_number, ...r });
      } catch (e) {
        out.push({ id: o.id, ok: false, error: String((e && e.message) || e).slice(0, 120) });
      }
      await new Promise((res) => setTimeout(res, 700)); // stay under the API rate limit
    }
    return Response.json({ ok: true, checked: out.length, results: out });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
