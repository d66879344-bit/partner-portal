import { checkAdminSecret } from "../../_lib/auth.js";
import { ensureHidePassengerColumn } from "../../_lib/partner-privacy.js";

// Turns "hide passenger data in completed trips" on or off for one partner.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });
    const on = !!body.on;
    await ensureHidePassengerColumn(env.DB);
    await env.DB.prepare("UPDATE partners SET hide_passenger_data = ? WHERE id = ?").bind(on ? 1 : 0, id).run();
    return Response.json({ ok: true, hidePassengerData: on });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
