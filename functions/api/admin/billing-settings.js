import { checkAdminSecret } from "../../_lib/auth.js";

// Admin sets, per partner, which of our own billing entities issues their
// invoice and the address it's emailed to. Read by functions/api/partner/invoice.js
// at the moment an invoice is generated (snapshotted onto the invoice row).
const BILLING_COMPANIES = ["PartnerRelay Ltd", "PartnerRelay Americas LLC", "PartnerRelay EU B.V."];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const rawCompany = (body.billingCompany || "").toString().trim();
    const billingCompany = rawCompany && BILLING_COMPANIES.indexOf(rawCompany) !== -1 ? rawCompany : null;
    if (rawCompany && billingCompany === null) return Response.json({ error: "invalid_billing_company" }, { status: 400 });

    const rawEmail = (body.billingEmail || "").toString().trim().toLowerCase();
    if (rawEmail && !EMAIL_RE.test(rawEmail)) return Response.json({ error: "invalid_billing_email" }, { status: 400 });

    await env.DB.prepare("UPDATE partners SET billing_company = ?, billing_email = ? WHERE id = ?")
      .bind(billingCompany, rawEmail || null, id)
      .run();
    return Response.json({ ok: true, billingCompany, billingEmail: rawEmail || null });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
