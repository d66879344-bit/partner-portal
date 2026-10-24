// Config for the regression suite that exercises the REAL, deployed
// PartnerRelay site through the dedicated test account (id656888) — see
// e2e/regression.spec.js for what it covers and e2e/.env.example for the
// credentials it needs.
//
// How to run it:
//   cd tests
//   npm install
//   npx playwright install chromium      # one-time, downloads a browser
//   cp e2e/.env.example e2e/.env.local   # fill in the test account's own
//                                        # email/password and the admin
//                                        # password — never real partner
//                                        # or production-admin credentials
//   npm run test:e2e
//
// The .env.local file is loaded by regression.spec.js itself (see the
// small loader at the top of that file) — nothing here needs a separate
// dotenv setup.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  fullyParallel: false, // these tests share one partner account — run them one at a time
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://partnerrelay.net",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
