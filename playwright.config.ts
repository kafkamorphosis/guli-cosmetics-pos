import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// E2E_SELLER_USER / E2E_SELLER_PASS live in .env.test.local (gitignored): a throwaway seller account.
config({ path: ".env.test.local", quiet: true });

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
