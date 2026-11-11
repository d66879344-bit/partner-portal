import { checkAdminSecret } from "../../_lib/auth.js";
import { parseInstances, ensureTables, callApi, sendRotating } from "../../_lib/whatsapp.js";

// Admin helper for the WhatsApp notifications.
//   GET  ?action=status → state of each configured number (authorized or not)
//   GET  ?action=groups → the WhatsApp groups visible to the numbers (name + id)
//   POST { id, groupId } → save a partner's WhatsApp group ID (empty = remove)
//   POST { id, test: true } → send a test message to that partner's group
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const insts = parseInstances(env);
  if (!insts.length) return Response.json({ error: "whatsapp_not_configured" }, { status: 400 });
  const action = new URL(request.url).searchParams.get("action") || "status";

  if (action === "status") {
    const out = [];
    for (let i = 0; i < insts.length; i++) {
      try {
        const r = await callApi(insts[i], "GET", "getStateInstance");
        out.push({ number: i + 1, id: insts[i].id, state: (r.json && r.json.stateInstance) || ("HTTP " + r.status) });
      } catch (e) {
        out.push({ number: i + 1, id: insts[i].id, state: "error" });
      }
    }
    return Response.json({ ok: true, instances: out });
  }

  if (action === "groups") {
    const groups = {};
    let lastErr = "";
    for (let i = 0; i < insts.length; i++) {
      try {
        const r = await callApi(insts[i], "GET", "getContacts", null, "group=true");
        if (r.status !== 200 || !Array.isArray(r.json)) { lastErr = "HTTP " + r.status; continue; }
        r.json.forEach((c) => {
          if (c && c.id && String(c.id).endsWith("@g.us") && !groups[c.id]) {
            groups[c.id] = { id: c.id, name: c.name || c.contactName || "" };
          }
        });
      } catch (e) { lastErr = String((e && e.message) || e); }
    }
    const list = Object.keys(groups).map((k) => groups[k]).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return Response.json({ ok: true, groups: list, error: list.length ? null : lastErr || "empty" });
  }
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!checkAdminSecret(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });
  try {
    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) return Response.json({ error: "invalid_request" }, { status: 400 });
    await ensureTables(env.DB);

    if (body.test) {
      const row = await env.DB.prepare("SELECT group_id FROM partner_whatsapp WHERE partner_id = ?").bind(id).first();
      if (!row) return Response.json({ error: "no_group" }, { status: 400 });
      const r = await sendRotating(env, id, row.group_id, "✅ Test message from the partner platform. Notifications are connected.");
      return Response.json({ ok: r.ok, instance: r.instance, errors: r.errors });
    }

    let groupId = (body.groupId || "").toString().trim();
    if (groupId && !groupId.endsWith("@g.us")) {
      if (/^[0-9-]+$/.test(groupId)) groupId += "@g.us";
      else return Response.json({ error: "invalid_group_id" }, { status: 400 });
    }
    if (!groupId) {
      await env.DB.prepare("DELETE FROM partner_whatsapp WHERE partner_id = ?").bind(id).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO partner_whatsapp (partner_id, group_id) VALUES (?, ?) ON CONFLICT(partner_id) DO UPDATE SET group_id = excluded.group_id"
      ).bind(id, groupId).run();
    }
    return Response.json({ ok: true, groupId });
  } catch (e) {
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
