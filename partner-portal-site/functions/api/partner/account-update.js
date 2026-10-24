import { getPartnerId } from "../../_lib/auth.js";

const AIRPORT_CODE_RE = /^[A-Z0-9]{2,4}$/;
const VALID_LANGUAGES = ["en", "ru", "es", "el", "fr", "pt"];

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json();
    const sets = [];
    const values = [];
    const result = {};

    if (body.companyName !== undefined) {
      const companyName = (body.companyName || "").toString().trim().slice(0, 200);
      if (!companyName) return Response.json({ error: "invalid_submission", field: "companyName" }, { status: 400 });
      sets.push("company_name = ?");
      values.push(companyName);
      result.companyName = companyName;
    }

    if (body.phone !== undefined) {
      const phone = (body.phone || "").toString().trim().slice(0, 50);
      if (!phone) return Response.json({ error: "invalid_submission", field: "phone" }, { status: 400 });
      sets.push("phone = ?");
      values.push(phone);
      result.phone = phone;

      const serviceCity = (body.serviceCity || "").toString().trim().slice(0, 150);
      sets.push("service_city = ?");
      values.push(serviceCity || null);
      result.serviceCity = serviceCity;

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
      sets.push("covered_airports = ?");
      values.push(JSON.stringify(airports));
      result.airports = airports;
    }

    if (body.language !== undefined) {
      const language = VALID_LANGUAGES.indexOf(body.language) !== -1 ? body.language : "en";
      sets.push("language = ?");
      values.push(language);
      result.language = language;
    }

    if (!sets.length) return Response.json({ error: "invalid_submission" }, { status: 400 });

    values.push(partnerId);
    await env.DB.prepare(`UPDATE partners SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();

    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}
