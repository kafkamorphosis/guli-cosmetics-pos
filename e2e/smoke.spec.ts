import { expect, test } from "@playwright/test";

// One full counter flow against the real Supabase project. Data it creates uses barcodes
// starting with E2E; remove it afterwards with supabase/e2e-cleanup.sql.
const user = process.env.E2E_SELLER_USER;
const pass = process.env.E2E_SELLER_PASS;

test.skip(!user || !pass, "Set E2E_SELLER_USER and E2E_SELLER_PASS in .env.test.local");

test("sell a product by Tekpe to Uzbekistan and mark it ready", async ({ page }) => {
  const barcode = `E2E${Date.now()}`;

  await page.goto("/login");
  await page.getByLabel("Login").fill(user!);
  await page.getByLabel("Parol").fill(pass!);
  await page.getByRole("button", { name: "Kirish" }).click();
  await expect(page.getByText("Shtrix-kodni skanerlang")).toBeVisible();

  // Inventory: add a new product with 20 in stock.
  await page.getByRole("link", { name: "Ombor" }).first().click();
  await page.getByRole("button", { name: "Mahsulot qoʻshish" }).click();
  await page.getByLabel("Shtrix-kod").fill(barcode);
  await page.getByRole("button", { name: "Davom etish" }).click();
  await page.getByLabel("Nomi").fill(`E2E krem ${barcode}`);
  await page.getByLabel("Tannarx").fill("6000");
  await page.getByLabel("Chakana narx").fill("10000");
  await page.getByLabel("Optom narx").fill("8000");
  await page.getByLabel("Ogʻirlik (g)").fill("600");
  await page.getByLabel("Boshlangʻich miqdor").fill("20");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText(`E2E krem ${barcode}`).first()).toBeVisible();

  // Checkout: find it by typing the barcode, switch to optom, send by Tekpe to Uzbekistan.
  await page.getByRole("link", { name: "Kassa" }).first().click();
  const search = page.getByRole("combobox");
  await search.fill(barcode);
  await search.press("Enter");
  await expect(page.getByText(`E2E krem ${barcode}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Optom" }).first().click();
  await expect(page.getByText("8 000 ₩").first()).toBeVisible();

  await page.getByRole("button", { name: "Tekpe" }).first().click();
  await page.getByRole("radio", { name: /Oʻzbekiston/ }).click();
  await page.locator("#tekpe-phone").fill("010-0000-0001");
  await page.getByRole("dialog").getByLabel("Mijoz ismi").fill("E2E Mijoz");
  await page.getByRole("button", { name: "Tekpe buyurtma yaratish" }).click();

  const success = page.getByRole("dialog");
  await expect(success.getByText("Buyurtma yaratildi")).toBeVisible();
  await expect(success.getByText("+ 10 $")).toBeVisible();
  const orderNo = (await success.locator(".monument").first().innerText()).trim();
  expect(orderNo).toMatch(/^#\d{6,}$/);
  await page.getByRole("button", { name: "Yangi buyurtma" }).click();

  // Tekpe board: the order waits in "Yangi"; mark it ready.
  await page.getByRole("link", { name: "Tekpe" }).first().click();
  const row = page.locator("li", { hasText: orderNo });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Tayyor" }).click();
  await page.getByRole("tab", { name: /Tayyor/ }).click();
  await expect(page.locator("li", { hasText: orderNo })).toBeVisible();

  // Printed sheet: shows the order, never the cost price.
  await page.locator("li", { hasText: orderNo }).getByRole("link").click();
  const orderUrl = page.url();
  await page.goto(orderUrl.replace("/buyurtmalar/", "/print/"));
  await expect(page.getByText(orderNo).first()).toBeVisible();
  await expect(page.getByText("E2E Mijoz")).toBeVisible();
  await expect(page.getByText("0,6 kg").first()).toBeVisible();
  await expect(page.getByText("6 000 ₩")).toHaveCount(0);

  // Inventory: stock went from 20 to 19.
  await page.goto("/ombor");
  await page.getByPlaceholder("Nomi yoki shtrix-kod boʻyicha qidirish").fill(barcode);
  await expect(page.getByRole("button", { name: "Omborda: 19" }).first()).toBeVisible();
});
