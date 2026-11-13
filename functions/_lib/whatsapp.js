// WhatsApp group notifications through Green API (https://green-api.com).
// Entirely optional: does nothing unless GREEN_API_INSTANCES is set in the
// Cloudflare Pages environment variables.
//
//   GREEN_API_INSTANCES — the support numbers, comma-separated:
//       idInstance:apiTokenInstance,idInstance:apiTokenInstance,...
//     (optional custom host after "@": 1101000001:token@https://1101.api.greenapi.com)
//
// Each partner has one WhatsApp group (admin sets its ID in the partner card).
// When orders are sent to a partner, one message goes to that group from the
// next number in the rotation; if a number fails, the next one is tried.
// Never throws and never delays the response (runs via context.waitUntil).
//
// Two small tables are created automatically on first use, so no manual
// database migration is needed:
//   partner_whatsapp (partner_id, group_id)
//   whatsapp_log     (every attempt: which number, ok or error)

export function parseInstances(env) {
  const raw = (env && env.GREEN_API_INSTANCES) || "";
  return String(raw)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let apiUrl = "";
      const at = s.indexOf("@");
      if (at !== -1) { apiUrl = s.slice(at + 1).trim(); s = s.slice(0, at).trim(); }
      const colon = s.indexOf(":");
      if (colon === -1) return null;
      const id = s.slice(0, colon).trim();
      const token = s.slice(colon + 1).trim();
      if (!id || !token) return null;
      if (!apiUrl) apiUrl = id.length >= 10 ? "https://" + id.slice(0, 4) + ".api.greenapi.com" : "https://api.green-api.com";
      return { id, token, apiUrl: apiUrl.replace(/\/+$/, "") };
    })
    .filter(Boolean);
}

let instanceColumnReady = false;
export async function ensureTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS partner_whatsapp (partner_id INTEGER PRIMARY KEY, group_id TEXT NOT NULL)").run();
  // Optional: pin a partner's group to one specific number (1-based). Empty = rotate.
  if (!instanceColumnReady) {
    try { await db.prepare("ALTER TABLE partner_whatsapp ADD COLUMN wa_instance INTEGER").run(); } catch (e) {}
    instanceColumnReady = true;
  }
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS whatsapp_log (id INTEGER PRIMARY KEY AUTOINCREMENT, partner_id INTEGER, instance_idx INTEGER, ok INTEGER NOT NULL DEFAULT 0, info TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))"
  ).run();
}

export async function getGroupId(db, partnerId) {
  try {
    await ensureTables(db);
    const r = await db.prepare("SELECT group_id FROM partner_whatsapp WHERE partner_id = ?").bind(partnerId).first();
    return r ? r.group_id : "";
  } catch (e) {
    return "";
  }
}

// Which number (1-based) is this partner's group pinned to? null = rotate as usual, -1 = off.
export async function getPinnedInstance(db, partnerId) {
  try {
    await ensureTables(db);
    const r = await db.prepare("SELECT wa_instance FROM partner_whatsapp WHERE partner_id = ?").bind(partnerId).first();
    const n = r && r.wa_instance != null ? Number(r.wa_instance) : 0;
    if (n < 0) return -1; // WhatsApp switched off for this partner
    return n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

export function buildMessage(count) {
  const n = Math.max(1, Number(count) || 1);
  const head = "ℹ️ Dear Partners, ";
  const tail = " to your personal account. Please log in to the platform and review the order details.";
  return n === 1
    ? head + "[1] new order has been sent" + tail
    : head + "[" + n + "] new orders have been sent" + tail;
}

async function callApi(inst, method, path, body, query) {
  const url = inst.apiUrl + "/waInstance" + inst.id + "/" + path + "/" + inst.token + (query ? "?" + query : "");
  const init = method === "POST"
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { method: "GET" };
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: res.status, json, text };
}

export async function sendText(inst, chatId, message) {
  try {
    const r = await callApi(inst, "POST", "sendMessage", { chatId, message });
    if (r.status >= 200 && r.status < 300 && r.json && r.json.idMessage) return { ok: true, info: r.json.idMessage };
    return { ok: false, info: ("HTTP " + r.status + " " + r.text).slice(0, 300) };
  } catch (e) {
    return { ok: false, info: String((e && e.message) || e).slice(0, 300) };
  }
}

// Round-robin: start with the number after the one used last successfully.
async function nextStart(db, total) {
  try {
    const r = await db.prepare("SELECT instance_idx FROM whatsapp_log WHERE ok = 1 ORDER BY id DESC LIMIT 1").first();
    if (r && r.instance_idx != null) return (Number(r.instance_idx) + 1) % total;
  } catch (e) {}
  return 0;
}

// Sends `message` to `groupId`, rotating across numbers with failover.
// Returns { ok, instance (1-based) | null, errors: [] }.
export async function sendRotating(env, partnerId, groupId, message) {
  const insts = parseInstances(env);
  if (!insts.length) return { ok: false, instance: null, errors: ["GREEN_API_INSTANCES not set"] };
  const db = env.DB;
  let start = 0;
  try { await ensureTables(db); start = await nextStart(db, insts.length); } catch (e) {}
  const errors = [];

  // Pinned partner: always the same number, never a fallback - on a free (Developer)
  // plan each number may only talk to 3 chats, so spilling over to another number
  // would use up that number's slots.
  const pinned = partnerId ? await getPinnedInstance(db, partnerId) : null;
  if (pinned === -1) return { ok: false, instance: null, errors: ["WhatsApp is switched off for this partner"] };
  if (pinned) {
    if (pinned > insts.length) return { ok: false, instance: null, errors: ["pinned number #" + pinned + " is not configured"] };
    const pidx = pinned - 1;
    const pr = await sendText(insts[pidx], groupId, message);
    try {
      await db.prepare("INSERT INTO whatsapp_log (partner_id, instance_idx, ok, info) VALUES (?, ?, ?, ?)")
        .bind(partnerId || null, pidx, pr.ok ? 1 : 0, pr.info).run();
    } catch (e) {}
    if (pr.ok) return { ok: true, instance: pinned, errors };
    return { ok: false, instance: null, errors: ["#" + pinned + ": " + pr.info] };
  }
  for (let k = 0; k < insts.length; k++) {
    const idx = (start + k) % insts.length;
    const r = await sendText(insts[idx], groupId, message);
    try {
      await db.prepare("INSERT INTO whatsapp_log (partner_id, instance_idx, ok, info) VALUES (?, ?, ?, ?)")
        .bind(partnerId || null, idx, r.ok ? 1 : 0, r.info).run();
    } catch (e) {}
    if (r.ok) return { ok: true, instance: idx + 1, errors };
    errors.push("#" + (idx + 1) + ": " + r.info);
  }
  return { ok: false, instance: null, errors };
}

export function orderUpdatedMessage(orderNumber) {
  return "ℹ️ Dear Partners, order [#" + orderNumber + "] has been updated. Please log in to the platform and review the new details.";
}
export function orderChangesMessage(orderNumber, lines) {
  return "ℹ️ Dear Partners, order [#" + orderNumber + "] has been updated.\n\nChanged:\n" +
    lines.map((l) => "• " + l).join("\n") +
    "\n\nPlease log in to the platform and review the new details.";
}
export function flightTimeChangedMessage(orderNumber) {
  return "ℹ️ Dear Partners, the flight arrival time for order [#" + orderNumber + "] has changed. Please log in to the platform and review the new details.";
}
export function orderCancelledMessage(orderNumber) {
  return "⚠️ Dear Partners, order [#" + orderNumber + "] has been cancelled. Please check your personal account.";
}
export function noShowDecisionMessage(orderNumber) {
  return "ℹ️ Dear Partners, a decision has been made on the no-show for order [#" + orderNumber + "]. Please check your personal account.";
}

// One custom text to one partner's group. Fire-and-forget.
export function notifyText(context, partnerId, text) {
  const env = context.env;
  if (!env || !env.DB || !env.GREEN_API_INSTANCES || !partnerId || !text) return;
  const task = (async function () {
    try {
      const groupId = await getGroupId(env.DB, partnerId);
      if (!groupId) return;
      await sendRotating(env, partnerId, groupId, text);
    } catch (e) {}
  })();
  if (typeof context.waitUntil === "function") context.waitUntil(task);
}

// items: [{ partnerId, count }] — one message per partner. Fire-and-forget.
export function notifyPartners(context, items) {
  const env = context.env;
  if (!env || !env.DB || !env.GREEN_API_INSTANCES || !items || !items.length) return;
  const task = (async function () {
    for (const it of items) {
      try {
        const groupId = await getGroupId(env.DB, it.partnerId);
        if (!groupId) continue;
        await sendRotating(env, it.partnerId, groupId, buildMessage(it.count));
      } catch (e) {}
    }
  })();
  if (typeof context.waitUntil === "function") context.waitUntil(task);
}

export { callApi };
