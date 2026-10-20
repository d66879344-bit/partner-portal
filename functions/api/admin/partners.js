import { checkAdminSecret } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const { results } = await env.DB.prepare(
    `SELECT id, email, company_name, contact_name, phone, country, country_name, service_city, status, created_at, activated_at
     FROM partners ORDER BY created_at DESC`
  ).all();

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
  }));

  return Response.json({ ok: true, partners });
}
