# Unity Beauty POS — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: native) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the product: analytics (Statistika), low-stock notifications with Telegram alerts, the Windows desktop app with silent A4 printing, and the Phase 1 follow-ups the final review deferred.

**Architecture:** Same as Phase 1. Analytics is aggregated in `security definer` Postgres functions that enforce the role scope (sellers only ever see their own sales). Telegram messages are written to a `notification_log` table by triggers and sent from Postgres with `pg_net`, so alerts fire whichever device made the change. The desktop app is a separate Electron package in `desktop/` that loads the deployed web app and exposes `window.unityDesktop.print(orderId)` for silent printing.

**Tech Stack:** Phase 1 stack, plus `pg_net` (Supabase), Electron **44.9.3** (45.0.0 is two days old), electron-builder 26.15.3 (NSIS installer).

**Spec:** `docs/superpowers/specs/2026-10-23-unity-beauty-pos-design.md` §6.5, §6.6, §9, §13 Phase 2. Phase 1 plan and its conventions: `docs/superpowers/plans/2026-10-23-unity-beauty-pos-phase1.md`.

## Global Constraints

All Phase 1 Global Constraints still apply (Uzbek Latin copy in `src/lib/i18n/uz.ts`, KRW integers, Asia/Seoul dates, RPC error codes mapped by `errorMessage`, light gray `#f2f2f0` ground with sand-beige `#e8d9c4` actions and ink text, waybill cells). Plus:

- Analytics periods: **Kun / Hafta / Oy / Yil**, weeks start Monday, all boundaries in Asia/Seoul. Cancelled orders are excluded everywhere.
- Scope: `seller` always sees only own sales (enforced in SQL, not only UI); `owner` chooses Umumiy (all), Mening (own) or one seller.
- Revenue = Σ `subtotal` (products only; shipping reported separately in ₩ and $). Cost = Σ `cost_total`. Profit = revenue − cost.
- Telegram secrets (`bot_token`, `chat_id`) are readable only by admin and by `security definer` functions; never sent to non-admin browsers.
- Desktop app: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the bridge is exposed only to the configured app origin; other origins open in the system browser.
- Desktop package lives in `desktop/` with its own `package.json`; the web app's build, lint, tsconfig and Vercel upload ignore it.

## Review Focus

1. **A seller calls the analytics RPC with another seller's id (or null)** → still gets only their own numbers. Pinned in Task 2 SQL test.
2. **A product drops from 11 to 9 stock (threshold 10), then 9 → 8** → exactly one low-stock alert, not one per sale. Pinned in Task 5 SQL test.
3. **Period boundaries around Seoul midnight and Monday** (an order at 2026-10-25 23:30 KST belongs to Sunday's day and the week of Oct 19) → correct bucket. Pinned in Task 3 unit tests.
4. **Desktop: the web app navigates to a foreign link** (e.g. Supabase or Google) → it opens in the system browser and never gets the print bridge. Pinned in Task 7 unit tests (`isAllowedUrl`).
5. **Desktop: print requested while the network is down or the sheet fails to load** → a visible error, no blank page printed. Pinned in Task 7 (print handler rejects when `did-fail-load` fires) and manual check.

---

## File Structure

```
supabase/migrations/20261023000007_analytics.sql
supabase/migrations/20261023000008_low_stock_view.sql, 20261023000009_telegram.sql
supabase/tests/05_analytics.sql, 06_notifications.sql
src/lib/domain/period.ts (+ test)
src/lib/data/analytics.ts, notifications.ts
src/features/analytics/analytics-screen.tsx, kpi-strip.tsx, product-table.tsx, ranking-lists.tsx
src/features/notifications/notifications-screen.tsx, use-low-stock-count.ts
src/features/admin/telegram-form.tsx (+ actions in actions.ts)
src/app/(pos)/statistika/page.tsx, src/app/(pos)/bildirishnomalar/page.tsx
desktop/package.json, main.js, preload.js, lib.js, lib.test.js, settings.html, offline.html, config.json, build/icon.png
scripts/prepare-logos.mjs (adds desktop/build/icon.png)
```

---

### Task 1: Phase 1 follow-ups (deferred review minors)

**Files:** `src/features/checkout/checkout-screen.tsx`, `src/components/scanner/camera-scanner.tsx`, `src/features/tekpe/ready-scan-dialog.tsx`, `src/features/admin/actions.ts`, `src/features/inventory/inventory-screen.tsx`, `src/features/inventory/product-form.tsx`, `src/features/tekpe/tekpe-screen.tsx`, `src/proxy.ts`, `e2e/smoke.spec.ts`, `src/lib/domain/network.ts` (+ test), `src/lib/i18n/uz.ts`

**Interfaces:**
- Produces: `isNetworkError(e: unknown): boolean` in `src/lib/domain/network.ts` (true for `Failed to fetch`, Safari `Load failed`, `NetworkError`, `AbortError`/`TimeoutError`, no-code fetch errors); `REQUEST_TIMEOUT_MS = 15000`.

- [ ] **Step 1: Failing test** `network.test.ts`: `isNetworkError({ message: "TypeError: Load failed" })` true; `{ message: "Failed to fetch" }` true; `{ name: "AbortError", message: "x" }` true; `{ name: "TimeoutError" }` true; `{ code: "P0001", message: "EMPTY_CART" }` false; `new Error("boom")` false.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, use it in checkout (replace the local helper) and pass `.abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))` on the `create_order` RPC and the request-key lookup. **Step 4: Run** → PASS.
- [ ] **Step 5: Small fixes** (each a one-place change, verified by build + browser):
  - F9 and the Tekpe dialog confirm respect `useOnline()` (no submit while offline).
  - `CameraScanner`: if the dialog closed while `getUserMedia` was pending, stop the new stream's tracks before returning.
  - Tekpe `ReadyScanDialog` camera: `continuous` stays on, and the camera dialog closes automatically after each successful read so the confirm card is visible (one tap to reopen) — record as a ruling.
  - `setRole` also writes `app_metadata.role` through the admin API (so the two never disagree); disabling stays authoritative because the trigger only fires on role *changes* and banned users can't sign in.
  - Inventory filter compares barcodes case-insensitively.
  - `product-form.tsx`: on "barcode exists" (23505) after a partial save, load the existing product and continue to its restock step instead of a dead end.
  - Numeric inputs clamp to `0..2_000_000_000` (prices), qty `1..99_999` (cart, restock).
  - Restored cart refreshes prices/stock from the database on load (one `in("id", …)` query).
  - Tekpe tabs: "Koʻproq yuklash" loads the next 100.
  - Unknown-barcode toast action goes to `/ombor?barcode=<code>` and Ombor opens the add flow with it.
  - `proxy.ts` matcher uses `\\.` for the extension group.
  - `e2e/smoke.spec.ts` uses phone `010-0000-0001` (clearly fake).
- [ ] **Step 6: Commit** `fix: phase 1 follow-ups from final review`

---

### Task 2: Analytics database functions

**Files:** `supabase/migrations/20261023000007_analytics.sql`, `supabase/tests/05_analytics.sql`, `src/lib/database.types.ts`

**Interfaces:**
- Produces (`security definer`, `search_path = ''`, granted to `authenticated`):
  - `analytics_report(p_from timestamptz, p_to timestamptz, p_seller uuid default null) returns jsonb` with shape
    `{ orders, items, revenue, cost, profit, shipping_krw, shipping_usd, by_payment: [{ method, orders, revenue }], products: [{ product_id, name, photo_path, unit_weight_g, qty, revenue, cost }] }` (products ordered by revenue desc). Non-cancelled orders with `p_from <= created_at < p_to`.
  - `least_sold(p_days int, p_seller uuid default null, p_limit int default 10) returns table (product_id uuid, name text, photo_path text, stock int, qty_sold bigint)` — non-archived products with `stock > 0`, sales in the last `p_days` days, ordered `qty_sold asc, name`.
  - Scope rule for both: role `seller` → effective seller = `auth.uid()` whatever `p_seller` is; role `owner` → `p_seller` (null = everyone); other → `NOT_AUTHORIZED`.

- [ ] **Step 1: Failing test** `05_analytics.sql`: two sellers S1, S2 and an owner; products A (cost 6000, price 10000), B (cost 12000, price 20000). S1 sells A×2 cash and B×1 card (store); S2 sells A×1 transfer; S1 has one cancelled order of B×5.
  - owner, all: `orders = 2+1 = 3`, `revenue = 20000+20000+10000 = 50000`, `cost = 12000+12000+6000 = 30000`, `profit = 20000`, `by_payment` has cash 20000 / card 20000 / transfer 10000; products A qty 3 revenue 30000, B qty 1 revenue 20000; cancelled B×5 absent.
  - owner, `p_seller = S2`: revenue 10000.
  - **S1 with `p_seller = S2`** → S1's own numbers (revenue 40000); **S1 with null** → revenue 40000.
  - window: an order at `p_to` exactly is excluded, at `p_from` included.
  - tekpe UZ order adds to `shipping_usd`, not revenue.
  - `least_sold(14)` as owner: a product C with stock 5 and no sales is first with `qty_sold = 0`; archived and zero-stock products absent.
  - admin → `NOT_AUTHORIZED`.
- [ ] **Step 2: Run** (MCP `execute_sql`, helpers prepended) → FAIL (functions missing).
- [ ] **Step 3: Write and apply the migration** (MCP `apply_migration` name `analytics`), add index `orders (created_at) where status <> 'cancelled'` if absent (existing `orders_created_at_idx` is enough — do not add).
- [ ] **Step 4: Run** → PASS. Regenerate/patch types (`analytics_report` returns `Json`, `least_sold` returns rows).
- [ ] **Step 5: Commit** `feat: analytics report and least-sold functions with seller scoping`

---

### Task 3: Statistika screen

**Files:** `src/lib/domain/period.ts` (+ `period.test.ts`), `src/lib/data/analytics.ts`, `src/features/analytics/*`, `src/app/(pos)/statistika/page.tsx`, `src/components/shell/nav-items.ts`, `src/lib/i18n/uz.ts`

**Interfaces:**
- Produces:
  - `type PeriodKind = "day" | "week" | "month" | "year"`
  - `seoulToday(now: Date): string` (YYYY-MM-DD in Seoul)
  - `periodRange(kind, anchorYmd): { from: string; to: string; startYmd: string; endYmd: string }` (`from`/`to` are `+09:00` ISO strings, `to` exclusive, `endYmd` inclusive last day)
  - `shiftPeriod(kind, anchorYmd, dir: -1 | 1): string` (returns the adjacent period's start day)
  - `periodLabel(kind, anchorYmd): string` — day `23.10.2026`, week `19.10 – 25.10.2026`, month `Oktabr 2026`, year `2026` (Uzbek month names Yanvar…Dekabr)
  - `getReport(sb, from, to, sellerId|null)`, `getLeastSold(sb, days, sellerId|null)` in `data/analytics.ts`
  - Nav item Statistika `/statistika` (icon `ChartColumn`) between Buyurtmalar and Tekpe.

- [ ] **Step 1: Failing tests** `period.test.ts`:
  - `seoulToday(new Date("2026-10-25T14:30:00Z"))` → `"2026-10-25"` (23:30 KST); `new Date("2026-10-25T15:30:00Z")` → `"2026-10-26"`.
  - `periodRange("day","2026-10-25")` → from `2026-10-25T00:00:00+09:00`, to `2026-10-26T00:00:00+09:00`.
  - `periodRange("week","2026-10-25")` (Sunday) → start `2026-10-19`, end `2026-10-25`; `periodRange("week","2026-10-26")` (Monday) → start `2026-10-26`.
  - `periodRange("month","2026-12-15")` → `2026-12-01` … to `2027-01-01T00:00:00+09:00`; `periodRange("year","2026-03-03")` → `2026-01-01` … `2027-01-01`.
  - `shiftPeriod("month","2026-03-31",-1)` → `"2026-02-01"`; `shiftPeriod("week","2026-10-22",1)` → `"2026-10-26"`; `shiftPeriod("day","2026-12-31",1)` → `"2027-01-01"`.
  - labels as listed above.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (pure date math on UTC dates of the Y-M-D; no timezone library needed because Seoul has no DST). **Step 4: Run** → PASS.
- [ ] **Step 5: Screen** (client; inherits the waybill world, no new visual direction):
  - Header row: period switch cells Kun/Hafta/Oy/Yil (active inverted ink), ◀ label ▶ (▶ disabled beyond today), "Bugun" reset.
  - Owner only: scope select Umumiy / Mening / each seller (from `listSellers`). Sellers see a caption "Mening savdolarim".
  - KPI strip (ruled cells, monument figures): Savdo daromadi, Tannarx, Foyda (ok color when ≥ 0, danger when < 0), Buyurtmalar, Sotilgan mahsulotlar, Yetkazish (`₩` and `$` on two lines), then a payment row Naqd / Karta / Oʻtkazma with revenue and order count.
  - Product table: photo, name, avg price (revenue/qty), qty, revenue, unit weight, total weight, cost, profit, totals row; sortable by revenue/qty/profit; phone → stacked cards.
  - Two side lists: **Eng koʻp sotilganlar** (top 10 by qty from `products`) and **Eng kam sotilganlar** with a 14 kun / 30 kun toggle (`least_sold`), each row linking to the product in Ombor search.
  - Empty state per period ("Bu davrda savdo yoʻq").
  - URL params `?p=month&d=2026-10-23&s=<seller|me>` so a view can be bookmarked.
- [ ] **Step 6: Verify** in the browser as owner and as seller (seller: scope select absent, numbers = own), numbers cross-checked with an MCP SQL sum for the same window.
- [ ] **Step 7: Commit** `feat: add statistika screen with periods, scope, rankings`

---

### Task 4: Bildirishnomalar (low stock) screen and nav badge

**Files:** `supabase/migrations/20261023000008_low_stock_view.sql`, `src/lib/data/notifications.ts`, `src/features/notifications/*`, `src/app/(pos)/bildirishnomalar/page.tsx`, `src/components/shell/app-shell.tsx`, `nav-items.ts`, `uz.ts`

**Interfaces:**
- Produces: view `public.low_stock_products` (`security_invoker`) = non-archived products with `stock <= low_stock_threshold`; `listLowStock(sb)` ordered by `stock - low_stock_threshold` asc then name; `useLowStockCount(): number | null` (count query + realtime on `products` + focus refresh); nav item Bildirishnomalar `/bildirishnomalar` (icon `Bell`) with a count badge (ink pill; hidden at 0).
- On phones the bottom bar would have 6 items: keep Kassa, Ombor, Buyurtmalar, Tekpe and add a **Boshqa** (more) cell opening a sheet with Statistika and Bildirishnomalar (badge shown on Boshqa too).

- [ ] **Step 1: Failing SQL check** (in `06_notifications.sql`, first block): seller sees product with stock 9 / threshold 10 in `low_stock_products`; stock 11 absent; archived absent; admin sees nothing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Migration** (view + grant select to authenticated). **Step 4: Run** → PASS.
- [ ] **Step 5: Screen**: ruled list, most urgent first, each row: photo, name, barcode, stock vs threshold with the exact-proportion stock bar, "Omborga qoʻshish" opening the existing `RestockPanel` in a dialog. Empty state "Hamma mahsulot yetarli".
- [ ] **Step 6: Verify** badge updates live when stock changes on another tab. **Step 7: Commit** `feat: add low-stock notifications screen and nav badge`

---

### Task 5: Telegram alerts

**Files:** `supabase/migrations/20261023000009_telegram.sql`, `supabase/tests/06_notifications.sql`, `src/features/admin/telegram-form.tsx`, `src/features/admin/actions.ts`, `src/app/admin/sozlamalar/page.tsx`, `uz.ts`

**Interfaces:**
- Produces:
  - `create extension if not exists pg_net with schema extensions`
  - Table `app_secrets` (single row, `id boolean pk check (id)`, `telegram_bot_token text`, `telegram_chat_id text`, `telegram_enabled boolean default false`), RLS: select/update only `app_role() = 'admin'`.
  - Table `notification_log` (`id`, `kind` (`low_stock|tekpe_order`), `text`, `created_at`, `request_id bigint null`); no client grants.
  - `notify_telegram(p_kind text, p_text text)` (internal): insert into log; when enabled with token and chat id, `net.http_post('https://api.telegram.org/bot'||token||'/sendMessage', jsonb {chat_id, text, parse_mode:'HTML', disable_web_page_preview:true})` and store the request id.
  - Trigger `products_low_stock_alert` after update of `stock`: fires only when `old.stock > old.low_stock_threshold and new.stock <= new.low_stock_threshold and not new.is_archived`. Text: `⚠️ <b>Kam qoldi</b>: {name}\nOmborda: {stock} ta (chegara {threshold})`.
  - `create_order` calls `notify_telegram('tekpe_order', …)` after totals are written when `p_type = 'tekpe'`. Text: `📦 <b>Yangi Tekpe</b> #000123 · {Koreya|Oʻzbekiston}\n{customer name} · {phone}\n{item_count} ta · {kg} kg · {total}`. All user-provided text HTML-escaped (`&`, `<`, `>`).
  - Server actions (admin): `saveTelegram({ token, chatId, enabled })`, `sendTelegramTest(): ActionResult` (calls Telegram directly from the server with the stored token; returns Telegram's error description on failure), `findTelegramChats(token): { ok: true; chats: { id: string; title: string }[] } | { ok: false; error: string }` (reads `getUpdates` so the admin can pick the chat after sending `/start` to the bot).
- Token never leaves the server for non-admins: the settings page is admin-only; the form shows the token masked after save (`••••` + last 4).

- [ ] **Step 1: Failing tests** `06_notifications.sql` (Telegram disabled so no HTTP happens; assert on `notification_log`):
  - product stock 11, threshold 10: sale of 2 (→9) writes **one** `low_stock` row; next sale (→8) writes none; restock to 15 then sale to 10 writes one more.
  - tekpe order creates one `tekpe_order` row whose text contains the order number and HTML-escaped customer name (`<Ali & Co>` → `&lt;Ali &amp; Co&gt;`); store order creates none.
  - seller `select * from app_secrets` → 0 rows / permission denied; admin can update it.
- [ ] **Step 2: Run** → FAIL. **Step 3: Migration** (also re-creates `create_order` with the notify call — copy the Phase 1 body exactly, add only the call). **Step 4: Run** → PASS; MCP `get_advisors` clean for new objects.
- [ ] **Step 5: Admin UI** "Telegram xabarnomalari" section on Sozlamalar: step text (1. @BotFather → /newbot → tokenni nusxalang; 2. botga /start yozing; 3. "Chatni topish"), token field, chat picker filled by `findTelegramChats`, enable switch, Save, "Sinov xabarini yuborish".
- [ ] **Step 6: Verify** with the user's real bot (user action: create the bot with @BotFather and paste the token in the admin settings — never in chat): test message arrives; a low-stock crossing and a Tekpe order arrive.
- [ ] **Step 7: Commit** `feat: telegram alerts for low stock and new tekpe orders`

---

### Task 6: Desktop app — shell and settings

**Files:** `desktop/package.json`, `desktop/main.js`, `desktop/preload.js`, `desktop/lib.js`, `desktop/lib.test.js`, `desktop/settings.html`, `desktop/offline.html`, `desktop/config.json`, root `tsconfig.json` (exclude `desktop`), `eslint.config.mjs` (ignore `desktop/**`), `.vercelignore`

**Interfaces:**
- `lib.js` (CommonJS, pure, tested with `node --test`):
  - `resolveAppUrl({ argv: string[], saved: string | null, config: { url?: string } }): string | null` — precedence `--url=<u>` → saved setting → `config.json` url; only `https:` URLs, or `http://localhost:*` / `http://127.0.0.1:*`; trailing slash removed; invalid → null.
  - `isAllowedUrl(target: string, appUrl: string): boolean` — same origin only.
  - `printUrl(appUrl: string, orderId: string): string` — `${appUrl}/print/${encodeURIComponent(orderId)}`; rejects ids that aren't UUIDs (throws).
  - `readSettings(file) / writeSettings(file, patch)` — JSON in `app.getPath("userData")/settings.json` (`{ url?, printer? }`), tolerant of a missing/corrupt file.
- `main.js`: single-instance lock; main window 1280×800 min 1024×700, maximized, title "Unity Beauty", menu with "Printer va manzil sozlamalari" + reload + devtools only when `--dev`; loads app URL or `settings.html` when none; `did-fail-load` → `offline.html` with retry; `setWindowOpenHandler` and `will-navigate` send foreign URLs to `shell.openExternal`.
- `preload.js` (main window): `contextBridge.exposeInMainWorld("unityDesktop", { print: (orderId) => ipcRenderer.invoke("print-order", orderId) })` only when `location.origin` equals the app origin passed via `additionalArguments`.
- Settings window: app URL field, printer select from `webContents.getPrintersAsync()` (default marked), "Sinov chop etish" (prints a one-line test page silently), Save → reload main window.

- [ ] **Step 1: Failing tests** `lib.test.js`: precedence and validation of `resolveAppUrl` (`--url=https://x.vercel.app/` → `https://x.vercel.app`; `http://evil.com` rejected; `http://localhost:3000` accepted); `isAllowedUrl("https://x.vercel.app/print/1","https://x.vercel.app")` true, `"https://accounts.google.com"` false, `"https://x.vercel.app.evil.com"` false; `printUrl` rejects `"../admin"`; settings round-trip and corrupt-file tolerance.
- [ ] **Step 2: Run** `npm --prefix desktop test` → FAIL. **Step 3: Implement** `lib.js`. **Step 4: Run** → PASS.
- [ ] **Step 5: Implement** `main.js`, `preload.js`, `settings.html`, `offline.html`; `npm --prefix desktop install` (electron 44.9.3, electron-builder 26.15.3).
- [ ] **Step 6: Verify** `npm --prefix desktop start -- --url=http://localhost:3000 --dev`: window opens the app; `typeof window.unityDesktop` is `object` on the app and `undefined` on a foreign page.
- [ ] **Step 7: Commit** `feat: add electron desktop shell with settings`

---

### Task 7: Desktop app — silent printing and installer

**Files:** `desktop/main.js`, `desktop/lib.js` (+ tests), `desktop/package.json` (build config), `scripts/prepare-logos.mjs`, `README.md`

**Interfaces:**
- `ipcMain.handle("print-order", (e, orderId))`: validates sender origin; creates a hidden `BrowserWindow` (same default session → signed in), loads `printUrl(...)`, waits for `did-finish-load` **and** every image decoded (via `executeJavaScript`), then `webContents.print({ silent: true, printBackground: true, deviceName: settings.printer ?? "", pageSize: "A4" })`; resolves on success, rejects with the failure reason (load failure, print failure, 30 s timeout); always destroys the window.
- Web side: `printOrder` shows a toast on rejection (`uz.common.printFailed`) — small change in `src/features/print/print-order.ts`.
- electron-builder: `appId` `uz.unitybeauty.pos`, productName `Unity Beauty`, NSIS (per-user, desktop + start-menu shortcuts, artifact `UnityBeautyPOS-Setup-${version}.exe`), icon `desktop/build/icon.png` (512×512 from `Unity.png`, generated by `prepare-logos.mjs`).

- [ ] **Step 1: Failing test**: `waitForSheet` helper's timeout path — `withTimeout(promise, ms, reason)` rejects with `reason` after `ms` (lib.js, tested with a never-resolving promise and fake timers).
- [ ] **Step 2–4: RED → implement → GREEN.**
- [ ] **Step 5: Implement** the print handler and the web toast.
- [ ] **Step 6: Build** `npm --prefix desktop run dist` → `desktop/dist/UnityBeautyPOS-Setup-0.1.0.exe` exists.
- [ ] **Step 7: Verify** (needs the user at the PC): install, set the URL (Vercel or `http://localhost:3000`), choose the printer, "Sinov chop etish" prints silently; print an order from Kassa success dialog and from Buyurtmalar — no dialog, A4, B/W; unplug network → print shows the error toast, no blank page.
- [ ] **Step 8: README** "Windows ilovasi" section (install, URL, printer, unsigned-installer SmartScreen note: "More info → Run anyway"). **Commit** `feat: silent printing and windows installer`

---

### Task 8: Final verification

- [ ] `npm test`, `npm --prefix desktop test`, all SQL tests via MCP, `npm run build`, `npm run lint` green.
- [ ] Browser round (owner + seller) on Statistika and Bildirishnomalar at 375 and desktop widths.
- [ ] Fresh code review of the Phase 2 range (same reviewer prompt as Phase 1); one fix pass for Critical/Important.
- [ ] Remove any test data created (E2E/ST- prefixes) with the user's OK; restart order numbering if no real orders exist.

## Spec coverage (Phase 2)

| Spec | Task |
|---|---|
| §6.5 Statistika (periods, scope, KPIs, payment breakdown, product table, best/least sold) | 2, 3 |
| §6.6 Bildirishnomalar (list, badge, quick restock) | 4 |
| §6.6 Telegram (low stock, new Tekpe, pg_net) + §6.7 Telegram settings with test message | 5 |
| §9 Desktop app (Electron shell, bridge, silent print, printer picker, installer) | 6, 7 |
| Phase 1 final-review minors | 1 |
