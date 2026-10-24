import { getPartnerId } from "../../_lib/auth.js";
import { generateUniqueAccountId } from "../../_lib/account-id.js";

// 7% of every completed order amount earned by a partner this partner
// referred, accrued as a running cumulative total. Grouped by currency —
// same convention as the Finance tab's grand-total row, since a referred
// partner can bill in a different currency than this partner does.
const BONUS_RATE = 0.07;

function sumByCurrency(orders) {
  const out = {};
  for (const o of orders || []) {
    const amount = parseFloat(o.price);
    if (!amount || isNaN(amount)) continue;
    const cur = o.currency || "EUR";
    out[cur] = (out[cur] || 0) + amount * BONUS_RATE;
  }
  for (const cur of Object.keys(out)) out[cur] = Math.round(out[cur] * 100) / 100;
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const partnerId = await getPartnerId(request, env);
  if (!partnerId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_not_configured" }, { status: 500 });

  const me = await env.DB.prepare("SELECT account_id FROM partners WHERE id = ?").bind(partnerId).first();
  let accountId = me && me.account_id;
  if (!accountId) {
    accountId = await generateUniqueAccountId(env);
    if (accountId) {
      await env.DB.prepare("UPDATE partners SET account_id = ? WHERE id = ?").bind(accountId, partnerId).run();
    }
  }

  const { results: referred } = await env.DB.prepare(
    "SELECT id, company_name, status, created_at, trial_started_at, trial_simulate_ended FROM partners WHERE referred_by_partner_id = ? ORDER BY created_at DESC"
  ).bind(partnerId).all();

  const referredPartners = referred || [];
  let bonusByCurrency = {};
  const perPartnerOrders = {};

  if (referredPartners.length) {
    const ids = referredPartners.map((p) => p.id);
    const placeholders = ids.map(() => "?").join(",");
    const { results: orders } = await env.DB.prepare(
      `SELECT partner_id, price, currency FROM orders WHERE status = 'completed' AND partner_id IN (${placeholders})`
    ).bind(...ids).all();
    for (const o of orders || []) {
      (perPartnerOrders[o.partner_id] = perPartnerOrders[o.partner_id] || []).push(o);
    }
    bonusByCurrency = sumByCurrency(orders);
  }

  return Response.json({
    ok: true,
    accountId: accountId || null,
    bonusRate: BONUS_RATE,
    bonusByCurrency,
    referredPartners: referredPartners.map((p) => ({
      id: p.id,
      companyName: p.company_name,
      status: p.status,
      createdAt: p.created_at,
      trialStartedAt: p.trial_started_at || null,
      trialSimulateEnded: Number(p.trial_simulate_ended) === 1,
      bonusByCurrency: sumByCurrency(perPartnerOrders[p.id]),
    })),
  });
}
