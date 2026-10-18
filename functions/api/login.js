import { verifyPassword, signSession, sessionCookieHeader } from "../_lib/auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  if (!env.SESSION_SECRET) return Response.json({ error: "session_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();
    if (!email || !password) return Response.json({ error: "invalid_credentials" }, { status: 400 });

    const partner = await env.DB.prepare(
      "SELECT id, password_hash, password_salt, status, company_name FROM partners WHERE email = ?"
    ).bind(email).first();

    if (!partner) return Response.json({ error: "invalid_credentials" }, { status: 401 });
    const ok = await verifyPassword(password, partner.password_salt, partner.password_hash);
    if (!ok) return Response.json({ error: "invalid_credentials" }, { status: 401 });

    if (partner.status === "blocked") {
      return Response.json({ error: "blocked" }, { status: 403 });
    }

    // No approval gate on login itself — accounts can sign in right after registering.
    // Only document review (which activates the account) decides whether they receive orders.
    const token = await signSession(partner.id, env.SESSION_SECRET);
    return new Response(JSON.stringify({ ok: true, companyName: partner.company_name, status: partner.status }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookieHeader(token),
      },
    });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
