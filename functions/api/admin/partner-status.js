import { checkAdminSecret } from "../../_lib/auth.js";

const VALID = ["pending", "active", "blocked"];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    const status = (body.status || "").toString();
    const note = (body.note || "").toString().slice(0, 500);
    if (!id || VALID.indexOf(status) === -1) return Response.json({ error: "invalid_request" }, { status: 400 });

    if (status === "active") {
      await env.DB.prepare("UPDATE partners SET status = ?, admin_note = ?, activated_at = datetime('now') WHERE id = ?")
        .bind(status, note, id).run();
    } else {
      await env.DB.prepare("UPDATE partners SET status = ?, admin_note = ? WHERE id = ?")
        .bind(status, note, id).run();
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
