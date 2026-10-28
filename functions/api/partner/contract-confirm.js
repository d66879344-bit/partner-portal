import { getPartnerId } from "../../_lib/auth.js";

// Partner confirms they've reviewed the contract admin uploaded for them.
// This just records a timestamp on the documents row (owner_type='contract')
// — no formal e-signature, no name/ID entry, no third-party service, and it
// does not gate or block anything else on the account. Replacing the
// contract (functions/api/admin/contract-upload.js) deletes this documents
// row and inserts a fresh one with confirmed_at = NULL, so a new upload
// always needs a fresh confirmation with no extra reset logic here.
//
// Partners grandfathered in as contract_confirm_exempt (anyone who was
// already registered when the confirm feature shipped) never see the
// Confirm button in the UI, so this should not normally be called for them
// — but it's harmless either way since it only ever touches the documents
// row, never the exemption flag itself.
export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const doc = await env.DB.prepare(
      "SELECT id FROM documents WHERE partner_id = ? AND owner_type = 'contract' ORDER BY id DESC LIMIT 1"
    ).bind(partnerId).first();
    if (!doc) return Response.json({ error: "no_contract" }, { status: 400 });

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await env.DB.prepare("UPDATE documents SET confirmed_at = ? WHERE id = ?").bind(now, doc.id).run();

    return Response.json({ ok: true, confirmedAt: now });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}
