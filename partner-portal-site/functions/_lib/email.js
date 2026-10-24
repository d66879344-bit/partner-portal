// Thin wrapper around Resend's HTTPS API (https://resend.com) for
// transactional email from Cloudflare Pages Functions. Resend was chosen
// because sending is a single fetch() call with a bearer API key — no SMTP,
// which the Workers runtime can't do — so it needs only one secret, the
// same way env.ADMIN_SECRET already works.
//
// One-time setup (done by whoever administers the Cloudflare Pages
// project — this code does not and cannot do this part):
//   1. Create a free account at https://resend.com
//   2. Add partnerrelay.net as a sending domain there and add the few
//      DNS records Resend shows (SPF/DKIM) — the domain's nameservers are
//      already on Cloudflare, so this is a couple of records in the same
//      dashboard, no transfer needed.
//   3. Create an API key on resend.com and add it to the Cloudflare Pages
//      project as a secret environment variable named RESEND_API_KEY
//      (Pages project -> Settings -> Environment variables), the same way
//      ADMIN_SECRET / DB / BUCKET are already configured there.
//   Optionally also set MAIL_FROM (e.g. "PartnerRelay <invoices@partnerrelay.net>")
//   to override the default sender shown below.
//
// Until RESEND_API_KEY is set, sendEmail() returns
// { ok: false, error: "email_not_configured" } instead of throwing, so
// callers can degrade gracefully (e.g. tell the admin/partner sending isn't
// set up yet) rather than crash — same graceful-fallback pattern already
// used elsewhere in this codebase for not-yet-run migrations.

const DEFAULT_FROM = "PartnerRelay <invoices@partnerrelay.net>";

export async function sendEmail(env, { to, subject, html, replyTo, cc }) {
  if (!env.RESEND_API_KEY) return { ok: false, error: "email_not_configured" };
  if (!to) return { ok: false, error: "missing_recipient" };

  try {
    const payload = {
      from: env.MAIL_FROM || DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject: subject || "",
      html: html || "",
    };
    if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
    if (replyTo) payload.reply_to = replyTo;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: "send_failed", status: res.status, detail: detail.slice(0, 500) };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data.id || null };
  } catch (e) {
    return { ok: false, error: "send_exception", detail: String((e && e.message) || e) };
  }
}
