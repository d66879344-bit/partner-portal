import { checkAdminSecret } from "../../_lib/auth.js";

function docShape(d) {
  return {
    id: d.id,
    field: d.field,
    label: d.label || d.field,
    filename: d.filename,
    status: d.status,
    reviewNote: d.review_note,
    uploadedAt: d.uploaded_at,
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (!id) return Response.json({ error: "invalid_id" }, { status: 400 });

  // `organization` and the billing/trial-simulate/payment columns are newer
  // (see migration-partner-organization.sql / migration-invoicing-referrals-contract.sql)
  // — fall back to the query without them if they haven't been migrated on
  // this database yet.
  let partner;
  try {
    partner = await env.DB.prepare(
      `SELECT id, email, company_name, contact_name, phone, account_id, covered_airports, service_city, country, country_name, status, admin_note, created_at, activated_at, organization,
              trial_started_at, trial_simulate_ended, billing_company, billing_email,
              pay_account_holder, pay_bank_name, pay_account_number, pay_swift, pay_currency
       FROM partners WHERE id = ?`
    ).bind(id).first();
  } catch (e) {
    try {
      partner = await env.DB.prepare(
        `SELECT id, email, company_name, contact_name, phone, account_id, covered_airports, service_city, country, country_name, status, admin_note, created_at, activated_at, organization
         FROM partners WHERE id = ?`
      ).bind(id).first();
    } catch (e2) {
      partner = await env.DB.prepare(
        `SELECT id, email, company_name, contact_name, phone, account_id, covered_airports, service_city, country, country_name, status, admin_note, created_at, activated_at
         FROM partners WHERE id = ?`
      ).bind(id).first();
    }
  }
  if (!partner) return Response.json({ error: "not_found" }, { status: 404 });

  let invoice = null;
  try {
    invoice = await env.DB.prepare(
      "SELECT id, invoice_number, period_start, period_end, status, generated_at, sent_at FROM invoices WHERE partner_id = ? ORDER BY id DESC LIMIT 1"
    ).bind(id).first();
  } catch (e) {
    invoice = null;
  }

  let airports = [];
  try {
    airports = JSON.parse(partner.covered_airports || "[]");
    if (!Array.isArray(airports)) airports = [];
  } catch (e) {
    airports = [];
  }

  const [vehiclesRes, driversRes, documentsRes] = await Promise.all([
    env.DB.prepare("SELECT id, plate, category, make FROM vehicles WHERE partner_id = ? ORDER BY id ASC").bind(id).all(),
    env.DB.prepare("SELECT id, full_name, phone, language FROM drivers WHERE partner_id = ? ORDER BY id ASC").bind(id).all(),
    env.DB.prepare(
      "SELECT id, owner_type, owner_id, field, label, filename, status, review_note, uploaded_at FROM documents WHERE partner_id = ? ORDER BY uploaded_at DESC"
    ).bind(id).all(),
  ]);

  const docs = documentsRes.results || [];
  const byOwner = (type, oid) => docs.filter((d) => d.owner_type === type && (oid == null ? d.owner_id == null : d.owner_id === oid)).map(docShape);

  const vehicles = (vehiclesRes.results || []).map((v) => ({ id: v.id, plate: v.plate, category: v.category, make: v.make, documents: byOwner("vehicle", v.id) }));
  const drivers = (driversRes.results || []).map((d) => ({ id: d.id, fullName: d.full_name, phone: d.phone, language: d.language, documents: byOwner("driver", d.id) }));

  return Response.json({
    ok: true,
    partner: {
      id: partner.id,
      email: partner.email,
      companyName: partner.company_name,
      contactName: partner.contact_name,
      phone: partner.phone,
      accountId: partner.account_id,
      airports: airports,
      serviceCity: partner.service_city,
      country: partner.country,
      countryName: partner.country_name,
      status: partner.status,
      adminNote: partner.admin_note,
      createdAt: partner.created_at,
      activatedAt: partner.activated_at,
      organization: partner.organization || null,
      trialStartedAt: partner.trial_started_at || null,
      trialSimulateEnded: Number(partner.trial_simulate_ended) === 1,
      billingCompany: partner.billing_company || null,
      billingEmail: partner.billing_email || null,
      payAccountHolder: partner.pay_account_holder || "",
      payBankName: partner.pay_bank_name || "",
      payAccountNumber: partner.pay_account_number || "",
      paySwift: partner.pay_swift || "",
      payCurrency: partner.pay_currency || "",
    },
    company: { documents: byOwner("company", null) },
    other: { documents: byOwner("other", null) },
    contract: { documents: byOwner("contract", null) },
    priceList: { documents: byOwner("price_list", null) },
    invoice: invoice
      ? {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          periodStart: invoice.period_start,
          periodEnd: invoice.period_end,
          status: invoice.status,
          generatedAt: invoice.generated_at,
          sentAt: invoice.sent_at,
        }
      : null,
    vehicles,
    drivers,
  });
}
