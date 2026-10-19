import { getPartnerId } from "../../_lib/auth.js";

const AIRPORT_CODE_RE = /^[A-Z0-9]{2,4}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json();
    const phone = (body.phone || "").toString().trim().slice(0, 50);
    if (!phone) return Response.json({ error: "invalid_submission", field: "phone" }, { status: 400 });
    const serviceCity = (body.serviceCity || "").toString().trim().slice(0, 150);

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

    await env.DB.prepare("UPDATE partners SET phone = ?, covered_airports = ?, service_city = ? WHERE id = ?")
      .bind(phone, JSON.stringify(airports), serviceCity || null, partnerId)
      .run();

    return Response.json({ ok: true, phone, airports, serviceCity });
  } catch (e) {
    return Response.json({ error: "server_error", message: String(e && e.message || e) }, { status: 500 });
  }
}
