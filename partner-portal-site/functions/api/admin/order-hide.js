import { checkAdminSecret } from "../../_lib/auth.js";

// Hides an order from the admin view only. The order itself is left completely
// untouched, so the partner keeps seeing it exactly as before. This is the
// everyday "delete" action for the admin; permanent removal (for test-data
// cleanup) is the separate /api/admin/order-delete endpoint.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    await env.DB.prepare("UPDATE orders SET hidden_from_admin = 1 WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
