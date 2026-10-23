import { checkAdminSecret } from "../../_lib/auth.js";

// Testing-only toggle: forces a partner's trial to always display as ended,
// without touching the real trial_started_at date (so turning it back off
// instantly reverts to the real computed trial state — nothing to restore).
// The admin UI only shows this control for one specific test account
// (accountId === "id656888"); this endpoint itself accepts any partner id,
// the restriction is a UI-side gate, not a server-side one.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const on = !!body.on;
    await env.DB.prepare("UPDATE partners SET trial_simulate_ended = ? WHERE id = ?")
      .bind(on ? 1 : 0, id)
      .run();
    return Response.json({ ok: true, trialSimulateEnded: on });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
