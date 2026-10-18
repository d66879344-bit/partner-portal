import { getPartnerId } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const partner = await env.DB.prepare(
    "SELECT id, email, company_name, status, country, country_name, created_at FROM partners WHERE id = ?"
  ).bind(partnerId).first();
  if (!partner) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({
    ok: true,
    partner: {
      id: partner.id,
      email: partner.email,
      companyName: partner.company_name,
      status: partner.status,
      country: partner.country,
      countryName: partner.country_name,
      createdAt: partner.created_at,
    },
  });
}
