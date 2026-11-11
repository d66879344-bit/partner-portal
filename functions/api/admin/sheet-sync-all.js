import { checkAdminSecret } from "../../_lib/auth.js";

// One-off / repeatable catch-up: pushes EVERY existing partner to the Google
// Sheet (registered -> "Зарегистрировался", already accepted an order ->
// "Поехал"). Called in small chunks by the admin UI ("Sync with Google Sheet"
// button on the Partners tab) so no single request runs long.
// Safe to run again: the Apps Script never downgrades "Поехал" and repainting
// a row that already has its status changes nothing.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.SHEET_WEBHOOK_URL) return Response.json({ error: "sheet_not_configured" }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.min(30, Math.max(1, Number(body.limit) || 15));

    const totalRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM partners").first();
    const total = totalRow ? totalRow.n : 0;

    const partners = await env.DB.prepare(
      "SELECT id, email, company_name, created_at FROM partners ORDER BY id LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();
    const rows = partners.results || [];

    const events = [];
    for (const p of rows) {
      if (!p.email) continue;
      const first = await env.DB.prepare(
        "SELECT MIN(COALESCE(responded_at, created_at)) AS d FROM orders WHERE partner_id = ? AND status IN ('accepted','completed','no_show')"
      ).bind(p.id).first();
      if (first && first.d) {
        events.push({ email: String(p.email).toLowerCase(), company: p.company_name || "", event: "first_trip", date: String(first.d).slice(0, 10) });
      } else {
        events.push({ email: String(p.email).toLowerCase(), company: p.company_name || "", event: "registered", date: String(p.created_at || "").slice(0, 10) });
      }
    }

    let matched = 0, missing = [], fuzzy = [];
    if (events.length) {
      const res = await fetch(env.SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: env.SHEET_WEBHOOK_SECRET || "", batch: events }),
        redirect: "follow",
      });
      const text = await res.text();
      let out = null;
      try { out = JSON.parse(text); } catch (e) { /* not JSON */ }
      if (!out || !out.ok) {
        return Response.json({ error: "sheet_error", detail: out && out.error ? String(out.error).slice(0, 200) : "bad_response" }, { status: 502 });
      }
      matched = out.rows || 0;
      missing = Array.isArray(out.missing) ? out.missing : [];
      fuzzy = Array.isArray(out.fuzzy) ? out.fuzzy : [];
    }

    const next = offset + rows.length;
    return Response.json({ ok: true, total, sent: events.length, matched, missing, fuzzy, nextOffset: next, done: next >= total || rows.length === 0 });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
