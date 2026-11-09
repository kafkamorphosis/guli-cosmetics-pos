import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Design-review captures at real resolution, saved to .impeccable/review/.
// Run: npx playwright test e2e/capture.spec.ts   (uses the installed Microsoft Edge; needs
// E2E_SELLER_USER / E2E_SELLER_PASS in .env.test.local). Creates one store order (test data).
const user = process.env.E2E_SELLER_USER;
const pass = process.env.E2E_SELLER_PASS;
const OUT = ".impeccable/review";

test.skip(!user || !pass, "Set E2E_SELLER_USER and E2E_SELLER_PASS in .env.test.local");
test.use({ channel: "msedge" });
test.setTimeout(180_000);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Login").fill(user!);
  await page.getByLabel("Parol").fill(pass!);
  await page.getByRole("button", { name: "Kirish" }).click();
  // Either we leave /login, or the form shows why not — never wait forever.
  const alert = page.getByRole("alert");
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }),
    alert.waitFor({ timeout: 20_000 }).then(async () => {
      throw new Error(`Login rejected: ${(await alert.innerText()).trim()} — check E2E_SELLER_USER / E2E_SELLER_PASS in .env.test.local`);
    }),
  ]);
}

async function addFirstProduct(page: Page) {
  const search = page.getByRole("combobox");
  await search.fill("E2E");
  const option = page.getByRole("option").first();
  if (await option.isVisible({ timeout: 4000 }).catch(() => false)) await option.click();
  else await search.fill("");
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}

test("desktop captures", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  await page.goto("/login");
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-login-1100.png` });

  await login(page);
  await expect(page.getByRole("combobox")).toBeVisible();
  await addFirstProduct(page);
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-kassa-1100.png` });

  await page.setViewportSize({ width: 1024, height: 760 });
  await page.keyboard.press("F9");
  await page.getByText("Buyurtma yaratildi").waitFor({ timeout: 10_000 }).catch(() => {});
  await settle(page);
  await page.screenshot({ path: `${OUT}/desktop-success-1024.png` });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1100, height: 760 });
  for (const [path, name] of [
    ["/ombor", "desktop-ombor-1100"],
    ["/buyurtmalar", "desktop-orders-1100"],
    ["/tekpe", "desktop-tekpe-1100"],
  ] as const) {
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }

  // Printed sheet of the newest order, on screen and as print media.
  await page.goto("/buyurtmalar");
  await settle(page);
  const href = await page.locator('a[href^="/buyurtmalar/"]').first().getAttribute("href");
  if (href) {
    await page.setViewportSize({ width: 1024, height: 760 });
    await page.goto(href.replace("/buyurtmalar/", "/print/"));
    await settle(page);
    await page.screenshot({ path: `${OUT}/sheet-1024.png`, fullPage: true });
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: `${OUT}/sheet-print-1024.png`, fullPage: true });
    await page.emulateMedia({ media: "screen" });
  }
  await ctx.close();
});

test("mobile captures", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page);
  await expect(page.getByRole("combobox")).toBeVisible();
  await addFirstProduct(page);
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile-kassa.png` });

  await page.getByRole("button", { name: "Davom etish" }).click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/mobile-kassa-sheet.png` });
  await page.keyboard.press("Escape");

  for (const [path, name] of [
    ["/ombor", "mobile-ombor"],
    ["/tekpe", "mobile-tekpe"],
  ] as const) {
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  // Leave the cart empty for the next real sale.
  await page.goto("/");
  await page.evaluate(() => sessionStorage.clear());
  await ctx.close();
});
