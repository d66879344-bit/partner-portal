import { checkAdminSecret } from "../../_lib/auth.js";

// Admin edits a partner's own payment details (used to fill in "pay to" on
// their invoice). Same underlying columns as /api/partner/billing-update —
// admin and partner edit the same record, last save wins, no locking.
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const sets = [];
    const values = [];
    const result = {};

    const fields = [
      ["payAccountHolder", "pay_account_holder", 200],
      ["payBankName", "pay_bank_name", 200],
      ["payAccountNumber", "pay_account_number", 100],
      ["paySwift", "pay_swift", 30],
      ["payCurrency", "pay_currency", 10],
    ];
    for (const [key, col, max] of fields) {
      if (body[key] !== undefined) {
        const val = (body[key] || "").toString().trim().slice(0, max);
        sets.push(col + " = ?");
        values.push(val || null);
        result[key] = val;
      }
    }

    if (!sets.length) return Response.json({ error: "invalid_submission" }, { status: 400 });

    values.push(id);
    await env.DB.prepare(`UPDATE partners SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}
