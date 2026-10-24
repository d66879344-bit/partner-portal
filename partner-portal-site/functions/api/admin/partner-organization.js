import { checkAdminSecret } from "../../_lib/auth.js";

// Admin-only tag: which outside organization (if any) this partner works
// through. Never read by, or exposed to, the partner — see functions/api/partner/me.js,
// which deliberately does not select this column.
const ORG_OPTIONS = ["ShuttleDirect", "Mozio"];

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });

    const raw = (body.organization || "").toString().trim();
    const organization = raw && ORG_OPTIONS.indexOf(raw) !== -1 ? raw : null;
    if (raw && organization === null) return Response.json({ error: "invalid_organization" }, { status: 400 });

    await env.DB.prepare("UPDATE partners SET organization = ? WHERE id = ?").bind(organization, id).run();
    return Response.json({ ok: true, organization });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
