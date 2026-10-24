import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  // `organization` and the billing/trial-simulate columns are newer (see
  // migration-partner-organization.sql / migration-invoicing-referrals-contract.sql)
  // — fall back to the query without them if they haven't been migrated on
  // this database yet, so a pending migration degrades gracefully rather
  // than breaking the whole partners list.
  let results;
  try {
    ({ results } = await env.DB.prepare(
      `SELECT id, email, company_name, contact_name, phone, country, country_name, service_city, status, created_at, activated_at, trial_started_at, organization, account_id, billing_company, billing_email, trial_simulate_ended
       FROM partners ORDER BY created_at DESC`
    ).all());
  } catch (e) {
    try {
      ({ results } = await env.DB.prepare(
        `SELECT id, email, company_name, contact_name, phone, country, country_name, service_city, status, created_at, activated_at, trial_started_at, organization
         FROM partners ORDER BY created_at DESC`
      ).all());
    } catch (e2) {
      ({ results } = await env.DB.prepare(
        `SELECT id, email, company_name, contact_name, phone, country, country_name, service_city, status, created_at, activated_at, trial_started_at
         FROM partners ORDER BY created_at DESC`
      ).all());
    }
  }

  // Latest price-list document per partner, so the admin's Create Order form
  // can link straight to it without a separate request per partner. Best
  // effort: an older database without the price_list rows just yields an
  // empty map, and every partner's link is simply omitted.
  let priceListByPartner = {};
  try {
    const { results: priceListRows } = await env.DB.prepare(
      "SELECT partner_id, id, filename FROM documents WHERE owner_type = 'price_list' AND owner_id IS NULL ORDER BY uploaded_at DESC"
    ).all();
    (priceListRows || []).forEach((d) => {
      if (!priceListByPartner[d.partner_id]) priceListByPartner[d.partner_id] = { id: d.id, filename: d.filename };
    });
  } catch (e) {
    priceListByPartner = {};
  }

  const partners = (results || []).map((p) => ({
    id: p.id,
    email: p.email,
    companyName: p.company_name,
    contactName: p.contact_name,
    phone: p.phone,
    country: p.country,
    countryName: p.country_name,
    serviceCity: p.service_city,
    status: p.status,
    createdAt: p.created_at,
    activatedAt: p.activated_at,
    trialStartedAt: p.trial_started_at || null,
    organization: p.organization || null,
    accountId: p.account_id || null,
    billingCompany: p.billing_company || null,
    billingEmail: p.billing_email || null,
    trialSimulateEnded: Number(p.trial_simulate_ended) === 1,
    priceListDocId: (priceListByPartner[p.id] && priceListByPartner[p.id].id) || null,
    priceListFilename: (priceListByPartner[p.id] && priceListByPartner[p.id].filename) || null,
  }));

  return Response.json({ ok: true, partners });
}
