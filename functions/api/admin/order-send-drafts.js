import { checkAdminSecret } from "../../_lib/auth.js";

// Flips one or more draft orders to "offered" in a single request, so an
// admin can create several orders as drafts (hidden from the partner) and
// then release them to the partner all at once from the Drafts tab.
//
// Only rows that are CURRENTLY status = 'draft' get updated — anything else
// in the id list (already sent, cancelled, not a draft at all, or simply not
// found) is silently skipped rather than erroring, so a stale checkbox list
// or a double-click can't accidentally re-offer or corrupt an order that's
// already moved on.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids)
      ? body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!ids.length) return Response.json({ error: "invalid_request" }, { status: 400 });

    const placeholders = ids.map(() => "?").join(", ");
    const { results } = await env.DB.prepare(
      `SELECT id FROM orders WHERE status = 'draft' AND id IN (${placeholders})`
    ).bind(...ids).all();
    const draftIds = (results || []).map((r) => r.id);
    if (!draftIds.length) return Response.json({ error: "no_drafts_found" }, { status: 404 });

    const updatePlaceholders = draftIds.map(() => "?").join(", ");
    await env.DB.prepare(
      `UPDATE orders SET status = 'offered' WHERE status = 'draft' AND id IN (${updatePlaceholders})`
    ).bind(...draftIds).run();

    return Response.json({ ok: true, sent: draftIds.length, ids: draftIds });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
