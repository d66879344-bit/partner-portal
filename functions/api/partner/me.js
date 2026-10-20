import { getPartnerId } from "../../_lib/auth.js";
import { generateUniqueAccountId } from "../../_lib/account-id.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const partner = await env.DB.prepare(
    "SELECT id, email, company_name, phone, account_id, covered_airports, service_city, status, country, country_name, language, created_at FROM partners WHERE id = ?"
  ).bind(partnerId).first();
  if (!partner) return Response.json({ error: "not_found" }, { status: 404 });

  let accountId = partner.account_id;
  if (!accountId) {
    // Lazy backfill for partners created before the account_id column existed.
    accountId = await generateUniqueAccountId(env);
    if (accountId) {
      await env.DB.prepare("UPDATE partners SET account_id = ? WHERE id = ?").bind(accountId, partnerId).run();
    }
  }

  let airports = [];
  try {
    airports = JSON.parse(partner.covered_airports || "[]");
    if (!Array.isArray(airports)) airports = [];
  } catch (e) {
    airports = [];
  }

  return Response.json({
    ok: true,
    partner: {
      id: partner.id,
      email: partner.email,
      companyName: partner.company_name,
      phone: partner.phone || "",
      accountId: accountId || null,
      airports: airports,
      serviceCity: partner.service_city || "",
      status: partner.status,
      country: partner.country,
      countryName: partner.country_name,
      language: partner.language || "en",
      createdAt: partner.created_at,
    },
  });
}
