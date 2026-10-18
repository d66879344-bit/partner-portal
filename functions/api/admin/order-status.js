import { checkAdminSecret } from "../../_lib/auth.js";

const VALID = ["offered", "accepted", "declined", "completed", "cancelled"];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const status = (body.status || "").toString();
    if (!id || VALID.indexOf(status) === -1) return Response.json({ error: "invalid_request" }, { status: 400 });

    await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(status, id).run();

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
