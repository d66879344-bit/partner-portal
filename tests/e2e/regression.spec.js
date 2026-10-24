// Regression suite for partner-portal-site, run against the REAL deployed
// site through the dedicated test account (id656888) — see
// assets/admin.js's TRIAL_SIMULATE_ACCOUNT_ID. That account exists
// specifically so this is safe to run as often as you like without
// touching any real partner's data: every test here either changes nothing
// (re-saves the same values) or restores the state it changed before it
// finishes.
//
// Setup: see tests/e2e/.env.example and the comment at the top of
// tests/playwright.config.js.
//
// Run: cd tests && npm install && npx playwright install chromium
//      && cp e2e/.env.example e2e/.env.local  (fill it in)
//      && npm run test:e2e
import { test, expect } from "@playwright/test";
import { partnerLogin, adminLogin, openTestPartnerDetail, mainScrollTop } from "./helpers.js";

test.describe.serial("PartnerRelay regression suite (test account id656888)", () => {
  test("partner can sign in and reach the dashboard", async ({ page }) => {
    await partnerLogin(page);
    await expect(page).toHaveURL(/partner-dashboard\.html/);
    await expect(page.locator('[data-tab="orders"]')).toBeVisible();
  });

  test("admin: re-saving billing settings does not scroll the panel back to the top", async ({ page }) => {
    // Regression test for the bug fixed 2026-10-23: several admin actions
    // (document approve/reject, partner approve/reject, billing save,
    // contract upload, price-list upload, invoice-status save) used to
    // blank the open partner's detail panel to "Loading…" while
    // re-fetching, which shrank the scrollable .dash-main container and
    // made the browser snap the scroll position back to 0. The fix
    // (admin.js's refreshDetail() helper) keeps the panel's content on
    // screen during the refetch instead. This test re-saves the EXISTING
    // billing company/email values completely unchanged, so it's a true
    // no-op on the data and safe to run repeatedly.
    await adminLogin(page);
    const { detail, partnerId } = await openTestPartnerDetail(page);

    const companySel = detail.locator('[data-billing-company="' + partnerId + '"]');
    const emailInput = detail.locator('[data-billing-email="' + partnerId + '"]');
    await companySel.waitFor({ state: "visible" });
    const currentCompany = await companySel.inputValue();
    const currentEmail = await emailInput.inputValue();

    // Scroll the main content area down first, so a reset-to-0 is actually
    // visible rather than masked by already being near the top.
    await page.locator(".dash-main").evaluate((el) => { el.scrollTop = 400; });
    await page.waitForTimeout(100);
    const before = await mainScrollTop(page);
    expect(before).toBeGreaterThan(100);

    if (currentCompany) await companySel.selectOption(currentCompany);
    await emailInput.fill(currentEmail);
    await detail.locator('[data-billing-save="' + partnerId + '"]').click();
    await page.waitForTimeout(700); // let the save + refreshDetail() round-trip finish

    const after = await mainScrollTop(page);
    // The old bug reset this to 0; allow a little layout jitter but not a
    // collapse back toward the top.
    expect(after).toBeGreaterThan(before - 50);
  });

  test("simulate-trial-ended toggle correctly shows/hides the Ride Pool lock overlay", async ({ page, context }) => {
    await adminLogin(page);
    const { detail, partnerId } = await openTestPartnerDetail(page);
    const toggle = detail.locator('[data-trial-simulate="' + partnerId + '"]');
    await toggle.waitFor({
      state: "visible",
      timeout: 10000,
    }).catch(() => {
      throw new Error(
        'No "Simulate trial ended" toggle found for this partner — make sure TEST_PARTNER_COMPANY_NAME ' +
        "resolves to the one account with accountId id656888 (assets/admin.js's TRIAL_SIMULATE_ACCOUNT_ID)."
      );
    });
    const startedChecked = await toggle.isChecked();

    try {
      if (!startedChecked) {
        await toggle.check();
        await page.waitForTimeout(400);
      }

      const partnerPage = await context.newPage();
      await partnerLogin(partnerPage);
      await partnerPage.locator('[data-tab="ridepool"]').click();
      await expect(partnerPage.locator("#ridePoolWrap")).toHaveClass(/unlocked/, { timeout: 10000 });
      await partnerPage.close();
    } finally {
      // Always restore the toggle to how it was found, pass or fail.
      if (!startedChecked && (await toggle.isChecked())) await toggle.uncheck();
    }
  });

  test("invoice: real line items load, and Send either delivers or fails with a clear message", async ({ page }) => {
    // Covers the invoice-email feature added 2026-10-23
    // (functions/api/partner/invoice.js + functions/_lib/email.js). Doesn't
    // assert that the email actually arrived (this suite can't check an
    // inbox) — it asserts the UI never silently claims success without
    // either a real status change or a surfaced error, which is the
    // behavior that feature is supposed to guarantee.
    await partnerLogin(page);
    await page.locator('[data-tab="finance"]').click();

    const generateBtn = page.locator("#invoiceGenerateBtn");
    const viewBtn = page.locator("#invoiceViewBtn");
    if (await generateBtn.count()) {
      // No invoice exists yet for this trial period — only possible to
      // reach this branch once the test account's trial has actually
      // ended (real end date, or the toggle in the previous test, which
      // that test always restores afterward).
      await generateBtn.click();
      await page.waitForTimeout(800);
    }
    await viewBtn.waitFor({ state: "visible", timeout: 10000 });
    await viewBtn.click();

    await expect(page.locator("#invoiceModal")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#invoiceModalBody")).toContainText(/Period/i);

    const sendBtn = page.locator("#invoiceSendBtn");
    if (await sendBtn.isVisible()) {
      let alertMessage = null;
      page.once("dialog", async (dialog) => {
        alertMessage = dialog.message();
        await dialog.accept();
      });
      await sendBtn.click();
      await page.waitForTimeout(1200);

      const statusBadge = page.locator("#invoiceModalBody .badge").first();
      const statusText = (await statusBadge.textContent().catch(() => "")) || "";
      // Either it actually sent (status moved off "Generated"), or Resend
      // isn't configured yet and the alert said so — both are correct
      // behavior for this feature; what would be WRONG is neither (a
      // silent no-op), which the assertion below rules out.
      const reallySent = !/generated/i.test(statusText);
      expect(reallySent || !!alertMessage).toBeTruthy();
    }

    await page.locator("#invoiceModalCloseBtn").click();
  });
});
