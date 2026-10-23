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
  }));

  return Response.json({ ok: true, partners });
}
