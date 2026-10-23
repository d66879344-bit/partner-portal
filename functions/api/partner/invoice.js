import { getPartnerId } from "../../_lib/auth.js";
import { computeTrial } from "../../_lib/trial.js";

function shape(inv) {
  if (!inv) return null;
  return {
    id: inv.id,
    invoiceNumber: inv.invoice_number,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    status: inv.status,
    billingCompany: inv.billing_company,
    billingEmail: inv.billing_email,
    payAccountHolder: inv.pay_account_holder,
    payBankName: inv.pay_bank_name,
    payAccountNumber: inv.pay_account_number,
    paySwift: inv.pay_swift,
    payCurrency: inv.pay_currency,
    generatedAt: inv.generated_at,
    sentAt: inv.sent_at,
  };
}

function dateOnly(d) {
  return d.toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const partner = await env.DB.prepare(
    "SELECT trial_started_at, trial_simulate_ended FROM partners WHERE id = ?"
  ).bind(partnerId).first();
  const trial = computeTrial(partner);

  const invoice = await env.DB.prepare(
    "SELECT * FROM invoices WHERE partner_id = ? ORDER BY id DESC LIMIT 1"
  ).bind(partnerId).first();

  return Response.json({ ok: true, trialEnded: trial.ended, invoice: shape(invoice) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const action = (body.action || "").toString();

    if (action === "generate") {
      const partner = await env.DB.prepare(
        `SELECT account_id, trial_started_at, trial_simulate_ended, billing_company, billing_email,
                pay_account_holder, pay_bank_name, pay_account_number, pay_swift, pay_currency
         FROM partners WHERE id = ?`
      ).bind(partnerId).first();
      if (!partner) return Response.json({ error: "not_found" }, { status: 404 });

      const trial = computeTrial(partner);
      if (!trial.ended) return Response.json({ error: "trial_not_ended" }, { status: 400 });

      const existing = await env.DB.prepare("SELECT id FROM invoices WHERE partner_id = ?").bind(partnerId).first();
      if (existing) return Response.json({ error: "invoice_already_exists" }, { status: 409 });

      if (!partner.billing_company || !partner.billing_email) {
        return Response.json({ error: "missing_billing_details" }, { status: 400 });
      }
      if (!partner.pay_account_holder || !partner.pay_bank_name || !partner.pay_account_number || !partner.pay_currency) {
        return Response.json({ error: "missing_payment_details" }, { status: 400 });
      }

      const periodStart = dateOnly(trial.start);
      const periodEnd = dateOnly(trial.end);
      const numPart = (partner.account_id || ("id" + String(partnerId).padStart(6, "0"))).replace(/^id/, "");
      const invoiceNumber = "INV-" + numPart;

      const r = await env.DB.prepare(
        `INSERT INTO invoices (partner_id, invoice_number, period_start, period_end, status,
                                billing_company, billing_email, pay_account_holder, pay_bank_name,
                                pay_account_number, pay_swift, pay_currency)
         VALUES (?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        partnerId, invoiceNumber, periodStart, periodEnd,
        partner.billing_company, partner.billing_email,
        partner.pay_account_holder, partner.pay_bank_name,
        partner.pay_account_number, partner.pay_swift || null, partner.pay_currency
      ).run();

      const invoice = await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(r.meta.last_row_id).first();
      return Response.json({ ok: true, invoice: shape(invoice) });
    }

    if (action === "send") {
      const invoice = await env.DB.prepare("SELECT id, status FROM invoices WHERE partner_id = ? ORDER BY id DESC LIMIT 1").bind(partnerId).first();
      if (!invoice) return Response.json({ error: "not_found" }, { status: 404 });
      if (invoice.status !== "generated") return Response.json({ error: "already_sent" }, { status: 400 });

      await env.DB.prepare(
        "UPDATE invoices SET status = 'sent', sent_at = datetime('now'), status_updated_at = datetime('now') WHERE id = ?"
      ).bind(invoice.id).run();

      const updated = await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(invoice.id).first();
      return Response.json({ ok: true, invoice: shape(updated) });
    }

    return Response.json({ error: "invalid_action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}
