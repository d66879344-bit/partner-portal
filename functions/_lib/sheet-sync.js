// Pings a Google Apps Script web app so the partner's row in the shared Google
// Sheet gets highlighted. Entirely optional: does nothing unless
// SHEET_WEBHOOK_URL is set in the Cloudflare Pages environment variables.
//   SHEET_WEBHOOK_URL    — the Apps Script "web app" URL (…/exec)
//   SHEET_WEBHOOK_SECRET — same value as SECRET in the Apps Script
// event: "registered" | "first_trip"
// Never throws and never delays the response: runs in the background via
// context.waitUntil, so a Google outage can't break registration or accepting.
export function notifySheet(context, event, email) {
  const env = context.env;
  if (!env || !env.SHEET_WEBHOOK_URL || !email) return;
  const task = fetch(env.SHEET_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: env.SHEET_WEBHOOK_SECRET || "",
      event: event,
      email: String(email).trim().toLowerCase(),
      date: new Date().toISOString().slice(0, 10),
    }),
    redirect: "follow",
  }).catch(function () {});
  if (typeof context.waitUntil === "function") context.waitUntil(task);
}
