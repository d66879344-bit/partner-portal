import { hashPassword } from "../_lib/auth.js";
import { generateUniqueAccountId } from "../_lib/account-id.js";

const COUNTRY_RE = /^[A-Z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AIRPORT_CODE_RE = /^[A-Z0-9]{2,4}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const country = String(body.country || "").toUpperCase();
    const countryName = String(body.countryName || "").trim().slice(0, 100);
    const company = String(body.company || "").trim();
    const phone = String(body.phone || "").trim().slice(0, 50);
    const serviceCity = String(body.serviceCity || "").trim().slice(0, 150);
    const refAccountId = String(body.ref || "").trim();

    let airports = [];
    if (Array.isArray(body.airports)) {
      const seen = new Set();
      for (const a of body.airports) {
        const code = String(a || "").trim().toUpperCase();
        if (AIRPORT_CODE_RE.test(code) && !seen.has(code)) {
          seen.add(code);
          airports.push(code);
        }
        if (airports.length >= 30) break;
      }
    }

    if (!EMAIL_RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "weak_password" }, { status: 400 });
    if (!COUNTRY_RE.test(country) || !company) {
      return Response.json({ error: "invalid_submission" }, { status: 400 });
    }
    if (!phone) {
      return Response.json({ error: "invalid_submission", field: "phone" }, { status: 400 });
    }

    const existing = await env.DB.prepare("SELECT id FROM partners WHERE email = ?").bind(email).first();
    if (existing) return Response.json({ error: "email_taken" }, { status: 409 });

    let referredBy = null;
    if (refAccountId) {
      const referrer = await env.DB.prepare("SELECT id FROM partners WHERE account_id = ?").bind(refAccountId).first();
      if (referrer) referredBy = referrer.id;
    }

    const { hash, salt } = await hashPassword(password);
    const accountId = await generateUniqueAccountId(env);

    const partnerInsert = await env.DB.prepare(
      `INSERT INTO partners (email, password_hash, password_salt, company_name, phone, account_id, covered_airports, service_city, country, country_name, status, referred_by_partner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(email, hash, salt, company.slice(0, 200), phone, accountId, JSON.stringify(airports), serviceCity || null, country, countryName || country, referredBy).run();
    const partnerId = partnerInsert.meta.last_row_id;

    return Response.json({ ok: true, id: partnerId });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}
