import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  // `organization` is a newer column (see migration-partner-organization.sql) — fall back to the
  // query without it if it hasn't been migrated on this database yet, so a pending migration
  // degrades to "no organization tags" rather than breaking the whole partners list.
  let results;
  try {
    ({ results } = await env.DB.prepare(
      `SELECT id, email, company_name, contact_name, phone, country, country_name, service_city, status, created_at, activated_at, trial_started_at, organization
       FROM partners ORDER BY created_at DESC`
    ).all());
  } catch (e) {
    ({ results } = await env.DB.prepare(
      `SELECT id, email, company_name, contact_name, phone, country, country_name, service_city, status, created_at, activated_at, trial_started_at
       FROM partners ORDER BY created_at DESC`
    ).all());
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
  }));

  return Response.json({ ok: true, partners });
}
