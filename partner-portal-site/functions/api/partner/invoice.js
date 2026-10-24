import { getPartnerId } from "../../_lib/auth.js";
import { computeTrial } from "../../_lib/trial.js";
import { sendEmail } from "../../_lib/email.js";

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDay(d) {
  if (!d) return "";
  const parts = String(d).slice(0, 10).split("-");
  return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : String(d);
}

// Builds the actual HTML email body for an invoice, computed server-side
// from the partner's real completed orders inside [period_start, period_end]
// — the same filter the partner dashboard uses to show the invoice on
// screen (status === "completed" and the order's date falls in that
// window), just run here in SQL instead of client-side, since this is the
// copy of the invoice that leaves the system by email. Kept table-based and
// inline-styled rather than using the dashboard's CSS classes, since email
// clients (Outlook especially) don't load external stylesheets or support
// modern layout CSS.
function buildInvoiceEmailHtml(invoice, companyName, trips) {
  const totals = {};
  const rows = trips.map((o) => {
    const amt = o.price ? Number(o.price) : 0;
    const cur = o.currency || "";
    if (o.price) totals[cur] = (totals[cur] || 0) + amt;
    return (
      "<tr>" +
      '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">' + escHtml(fmtDay(o.order_date)) + "</td>" +
      '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">' + escHtml(o.pickup) + " &rarr; " + escHtml(o.dropoff) + "</td>" +
      '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;">' + escHtml(o.vehicle_type || "—") + "</td>" +
      '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">' + (o.price ? escHtml(o.price) + " " + escHtml(cur) : "—") + "</td>" +
      "</tr>"
    );
  }).join("");
  const totalsLine = Object.keys(totals).map((cur) => totals[cur].toFixed(2) + " " + cur).join(", ") || "0";

  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">' +
      '<h2 style="margin:0 0 4px;">' + escHtml(invoice.billing_company || "Invoice") + "</h2>" +
      '<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">Invoice ' + escHtml(invoice.invoice_number || "") +
        " &middot; Period " + escHtml(fmtDay(invoice.period_start)) + "–" + escHtml(fmtDay(invoice.period_end)) + "</p>" +
      '<p style="font-size:14px;">Trial-period invoice for <b>' + escHtml(companyName) + "</b>.</p>" +
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;">' +
        "<thead><tr>" +
          '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #111827;font-size:12px;">Date</th>' +
          '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #111827;font-size:12px;">Trip</th>' +
          '<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #111827;font-size:12px;">Vehicle</th>' +
          '<th style="text-align:right;padding:6px 10px;border-bottom:2px solid #111827;font-size:12px;">Amount</th>' +
        "</tr></thead>" +
        "<tbody>" + (rows || '<tr><td colspan="4" style="padding:10px;color:#6b7280;font-size:13px;">No completed trips in this period.</td></tr>') + "</tbody>" +
      "</table>" +
      '<p style="font-size:14px;"><b>Total: ' + totalsLine + "</b></p>" +
      '<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">' +
      '<p style="font-size:13px;color:#374151;">Pay to: <b>' + escHtml(invoice.pay_account_holder || "") + "</b><br>" +
        escHtml(invoice.pay_bank_name || "") + " &middot; " + escHtml(invoice.pay_account_number || "") +
        (invoice.pay_swift ? " &middot; SWIFT " + escHtml(invoice.pay_swift) : "") + " &middot; " + escHtml(invoice.pay_currency || "") +
      "</p>" +
      '<p style="font-size:12px;color:#9ca3af;">Typically processed within 3–7 business days. Trips completed after the trial period are not included on this invoice.</p>' +
    "</div>"
  );
}

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
      const invoice = await env.DB.prepare("SELECT * FROM invoices WHERE partner_id = ? ORDER BY id DESC LIMIT 1").bind(partnerId).first();
      if (!invoice) return Response.json({ error: "not_found" }, { status: 404 });
      if (invoice.status !== "generated") return Response.json({ error: "already_sent" }, { status: 400 });
      if (!invoice.billing_email) return Response.json({ error: "missing_billing_email" }, { status: 400 });

      const partner = await env.DB.prepare("SELECT company_name, email FROM partners WHERE id = ?").bind(partnerId).first();

      const { results: trips } = await env.DB.prepare(
        `SELECT order_date, pickup, dropoff, vehicle_type, price, currency FROM orders
         WHERE partner_id = ? AND status = 'completed' AND order_date >= ? AND order_date <= ?
         ORDER BY order_date ASC`
      ).bind(partnerId, invoice.period_start, invoice.period_end).all();

      // Actually send the invoice by email before marking it "sent" — if
      // sending fails (most commonly because RESEND_API_KEY isn't
      // configured yet), the invoice stays "generated" so nothing is
      // falsely reported as delivered, and the partner can retry once
      // email sending is set up.
      const html = buildInvoiceEmailHtml(invoice, partner ? partner.company_name : "", trips || []);
      const sendResult = await sendEmail(env, {
        to: invoice.billing_email,
        cc: partner && partner.email ? partner.email : undefined,
        subject: "Invoice " + (invoice.invoice_number || "") + " — " + (partner ? partner.company_name : ""),
        html,
      });
      if (!sendResult.ok) {
        return Response.json({ error: "email_failed", reason: sendResult.error }, { status: 502 });
      }

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
