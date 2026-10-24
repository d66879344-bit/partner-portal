// Shared helpers for the PartnerRelay regression suite. These drive the
// REAL, deployed site (see playwright.config.js's baseURL) through the
// dedicated test account (id656888) that exists specifically so this kind
// of thing is safe to run without touching any real partner's data.
//
// Credentials are never hardcoded here — see .env.example for what to put
// in .env.local (gitignored) and regression.spec.js loads it automatically.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tiny, dependency-free .env loader — good enough for this file's handful
// of KEY=VALUE lines, so the suite doesn't need a dotenv package just for
// local runs. CI should set these as real environment variables instead;
// this is a no-op (and harmless) if .env.local doesn't exist.
function loadDotEnvLocal() {
  const file = path.join(__dirname, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

export const PARTNER_EMAIL = process.env.TEST_PARTNER_EMAIL || "";
export const PARTNER_PASSWORD = process.env.TEST_PARTNER_PASSWORD || "";
export const ADMIN_SECRET = process.env.TEST_ADMIN_SECRET || "";
export const PARTNER_COMPANY_NAME = process.env.TEST_PARTNER_COMPANY_NAME || "Test Account";

function requireEnv(name, value) {
  if (!value) {
    throw new Error(
      "Missing " + name + " — copy tests/e2e/.env.example to tests/e2e/.env.local and fill it in " +
      "with the test account's (id656888) own credentials. See the comments in .env.example."
    );
  }
}

export async function partnerLogin(page) {
  requireEnv("TEST_PARTNER_EMAIL", PARTNER_EMAIL);
  requireEnv("TEST_PARTNER_PASSWORD", PARTNER_PASSWORD);
  await page.goto("/login.html");
  await page.locator("#email").fill(PARTNER_EMAIL);
  await page.locator("#password").fill(PARTNER_PASSWORD);
  await page.locator("#loginBtn").click();
  await page.waitForURL(/partner-dashboard\.html/, { timeout: 15000 });
}

export async function adminLogin(page) {
  requireEnv("TEST_ADMIN_SECRET", ADMIN_SECRET);
  await page.goto("/admin.html");
  await page.locator("#secret").fill(ADMIN_SECRET);
  await page.locator("#unlock").click();
  await page.locator("#panelsWrap").waitFor({ state: "visible", timeout: 15000 });
}

// Finds and expands the test partner's row in the admin Partners list,
// paging through the (client-side-paginated) table if needed since the test
// account isn't guaranteed to land on page 1. Returns the expanded detail
// panel's locator plus the partner's numeric id (several admin actions
// below need that id).
export async function openTestPartnerDetail(page) {
  const row = page.locator("#partnersList tr.data-row", { hasText: PARTNER_COMPANY_NAME }).first();
  for (let i = 0; i < 25; i++) {
    if (await row.count()) break;
    const next = page.locator("#partnersPager [data-pager-next]");
    if (!(await next.count())) break;
    if ((await next.getAttribute("disabled")) !== null) break;
    await next.click();
    await page.waitForTimeout(150);
  }
  await row.waitFor({
    state: "visible",
    timeout: 10000,
  }).catch(() => {
    throw new Error(
      'Could not find a partner row containing "' + PARTNER_COMPANY_NAME + '" in the admin Partners ' +
      "list. If the test account's company name was changed, set TEST_PARTNER_COMPANY_NAME in .env.local."
    );
  });

  const toggleAttr = await row.getAttribute("data-toggle");
  const partnerId = Number(toggleAttr);
  const detail = page.locator("#detail-" + partnerId);
  const isOpen = await detail.evaluate((el) => el.classList.contains("open"));
  if (!isOpen) await row.click();
  await detail.locator(".block").first().waitFor({ state: "visible", timeout: 10000 });
  return { detail, partnerId };
}

// Reads the .dash-main scroll container's current scrollTop — the exact
// value the "approving a document scrolls me to the top" bug used to reset
// to 0 (fixed 2026-10-23 via assets/admin.js's refreshDetail() helper).
export async function mainScrollTop(page) {
  return page.locator(".dash-main").evaluate((el) => el.scrollTop);
}
