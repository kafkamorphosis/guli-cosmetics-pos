# Unity Beauty POS — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed web POS where Unity Beauty staff log in, manage inventory, ring up store and Tekpe orders by barcode (USB scanner or phone camera), print an A4 order sheet with a private QR, and move Tekpe orders New → Ready → Picked up.

**Architecture:** Next.js 16 App Router app on Vercel talking directly to Supabase (Postgres + Auth + Storage + Realtime). All stock/order writes go through `security definer` Postgres functions so they are atomic and device-independent; the browser only reads tables (RLS) and calls RPCs. Pure business logic (totals, shipping, phone, scanning) lives in `src/lib/domain/` with unit tests.

**Tech Stack:** Node 24, Next.js 16.4, React 19, TypeScript, Tailwind CSS 4.3, shadcn/ui, `@supabase/supabase-js` 2.118, `@supabase/ssr` 0.12, `barcode-detector` 3.2, `libphonenumber-js` 1.13, `qrcode` 1.5, `sharp` (scripts only), Vitest 5, Playwright 1.64, `pg` 8.23 (DB test runner).

**Spec:** `docs/superpowers/specs/2026-10-23-unity-beauty-pos-design.md` — read it before starting any task. This plan covers spec §13 Phase 1 (items 1–7). Phase 2 (analytics, notifications/Telegram, Electron) gets its own plan.

## Global Constraints

- Supabase project ref: `zeekxqinioeyrjyhuajw` (region `ap-northeast-2`). Migrations are applied with the Supabase MCP `apply_migration` tool **and** saved under `supabase/migrations/`.
- UI copy is **Uzbek (Latin)** only, all strings in `src/lib/i18n/uz.ts`. Use `ʻ` (U+02BB) in oʻ/gʻ (e.g. `Oʻtkazma`, `Mahsulot qoʻshish`) and `ʼ` (U+02BC) for the tutuq belgisi. The chosen font must render both.
- Colors: page background `#fcf2f0`, primary buttons `#f8ad9d` with **dark warm text** (not white).
- Money: integer KRW everywhere; only `shipping_usd` / `uz_shipping_usd_per_kg` are USD (numeric). Format `85 000 ₩` and `30 $` (space as thousands separator, symbol after).
- Weights: integer grams in data; totals displayed in kg with comma decimal (`1,25 kg`).
- Phones stored as E.164; default country **KR (+82)**, alternative **UZ (+998)**.
- Order number display: `#` + 6-digit zero pad (`#000123`).
- Dates displayed in **Asia/Seoul** as `DD.MM.YYYY HH:mm`.
- QR content = only the 10-char `qr_token` from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` — never a URL.
- The printed sheet never shows cost price, profit, seller account, or any system name.
- Online only; no service worker caching of data.
- Login is username + password; auth email is `<username>@unitybeauty.local`.
- Roles: `admin` (accounts + settings only, no POS screens), `owner`, `seller` (same POS rights in Phase 1).
- RPC errors are raised as `raise exception '<CODE>'` with codes from Task 2's `ErrorCode`; the UI shows the Uzbek text from `errorMessage(code)`.
- Never commit `.env*.local`. Secrets: `SUPABASE_SECRET_KEY` is server-only.
- UI tasks (6–12) use the `/impeccable` skill for visual decisions and `/web-design-guidelines` for a final pass; the plan fixes behavior, not pixels.

## Review Focus

1. **USB scan while the cursor is in the phone, name or search field** → the product is added to the cart and that field's text is unchanged. Pinned in Task 3 (`scan-burst` tests) and Task 10 (manual check).
2. **USB scanner and phone camera report the same product differently** (UPC-A 12 digits vs EAN-13 with a leading `0`) → same product found either way. Pinned in Task 2 (`barcodeCandidates` tests) and used in Tasks 8, 10.
3. **Double-tap Checkout, or retry after a network timeout** → exactly one order and stock decremented once. Pinned in Task 5 (`request_id` idempotency SQL test) and Task 10 (request id reused on retry).
4. **Phone typed as `010-1234-5678`, `01012345678`, `+82 10 1234 5678`, or a `+998…` number while the KR chip is selected** → all resolve to the same E.164 customer. Pinned in Task 2 (`normalizePhone` tests).
5. **An order cancelled twice (double-click or two devices)** → stock restored exactly once, second attempt shows "already cancelled". Pinned in Task 5 (`cancel_order` SQL test, row lock).

---

## File Structure

```
src/
  proxy.ts                         session refresh + auth redirects (Next 16 "proxy", formerly middleware)
  app/
    layout.tsx, globals.css        font, tokens, Toaster
    login/page.tsx                 username/password form
    (pos)/layout.tsx               requires owner|seller; renders AppShell
    (pos)/page.tsx                 Kassa (checkout)
    (pos)/ombor/page.tsx           Inventory
    (pos)/buyurtmalar/page.tsx     Orders list
    (pos)/buyurtmalar/[id]/page.tsx Order detail
    (pos)/tekpe/page.tsx           Tekpe board
    admin/layout.tsx               requires admin
    admin/page.tsx                 Accounts
    admin/sozlamalar/page.tsx      Settings
    print/[id]/page.tsx            A4 order sheet (no shell)
  lib/
    supabase/client.ts, server.ts, admin.ts
    database.types.ts              generated
    i18n/uz.ts
    auth/username.ts, auth/session.ts
    domain/money.ts, dates.ts, order-no.ts, shipping.ts, phone.ts, barcode.ts,
           cart.ts, errors.ts, scan-burst.ts, dedupe.ts   (+ *.test.ts beside each)
    data/products.ts, orders.ts, customers.ts, settings.ts, storage.ts
  components/
    ui/                            shadcn components
    shell/app-shell.tsx, shell/nav-items.ts
    scanner/use-hid-scanner.ts, scanner/camera-scanner.tsx, scanner/feedback.ts
    money.tsx                      <Krw/>, <Usd/>, <Weight/> display helpers
  features/
    checkout/  checkout-screen.tsx, cart-list.tsx, cart-row.tsx, product-search.tsx,
               customer-panel.tsx, tekpe-dialog.tsx, success-dialog.tsx, use-cart.ts
    inventory/ inventory-screen.tsx, summary-cards.tsx, product-table.tsx, stock-stepper.tsx,
               add-product-flow.tsx, product-form.tsx, restock-dialog.tsx, resize-image.ts
    orders/    orders-screen.tsx, order-filters.tsx, order-detail.tsx
    print/     order-sheet.tsx, print-order.ts, autoprint.tsx
    tekpe/     tekpe-screen.tsx, ready-scan-dialog.tsx
    admin/     actions.ts, validate.ts, accounts-table.tsx, account-dialog.tsx, settings-form.tsx
supabase/
  migrations/20261023000001_schema.sql
  migrations/20261023000002_functions.sql
  tests/_helpers.sql, 01_rls.sql, 02_create_order.sql, 03_cancel_status.sql, 04_stock.sql
  e2e-cleanup.sql
scripts/
  run-db-tests.mjs, create-admin.mjs, prepare-logos.mjs
public/brand/unity.png, public/brand/nura.png   (generated by prepare-logos)
e2e/smoke.spec.ts, playwright.config.ts
.env.example, README.md
```

---

### Task 1: Project scaffold, tooling, and formatters

**Files:**
- Create: Next.js app at repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`), `vitest.config.ts`, `.env.example`, `.gitignore` additions
- Create: `src/lib/domain/money.ts`, `dates.ts`, `order-no.ts` + tests
- Create: `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`

**Interfaces:**
- Produces:
  - `formatKrw(n: number): string`, `formatUsd(n: number): string`, `formatWeight(g: number): string`, `formatKg(g: number): string`
  - `formatDateTime(iso: string): string` (Asia/Seoul)
  - `formatOrderNo(n: number): string`
  - `supabaseBrowser(): SupabaseClient` (client.ts), `supabaseServer(): Promise<SupabaseClient>` (server.ts, cookie-based), `supabaseAdmin(): SupabaseClient` (admin.ts, secret key, `import 'server-only'`). Task 4 adds the generated `Database` type parameter to all three.
  - Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` (DB tests only)

- [ ] **Step 1: Scaffold** — in the repo root (it already contains `docs/`, `Unity.png`, `Nura.png`, `.git`): `npx create-next-app@16.4.2 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (answer yes to using the non-empty dir). Then `npx shadcn@latest init` (base color neutral) and install deps: `npm i @supabase/supabase-js@2.118.0 @supabase/ssr@0.12.7 libphonenumber-js@1.13.15 qrcode@1.5.4 barcode-detector@3.2.3 server-only` and `npm i -D vitest@5.0.5 @types/qrcode pg@8.23.1 sharp @playwright/test@1.64.1`. Add scripts: `"test": "vitest run"`, `"test:db": "node scripts/run-db-tests.mjs"`, `"e2e": "playwright test"`.

- [ ] **Step 2: Env** — write `.env.example` with the four env vars above (empty values). Create `.env.local`: fill `NEXT_PUBLIC_SUPABASE_URL` from MCP `get_project_url` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from MCP `get_publishable_keys` (project `zeekxqinioeyrjyhuajw`). **User action:** paste `SUPABASE_SECRET_KEY` (Dashboard → Project Settings → API Keys → secret key) and `SUPABASE_DB_URL` (Dashboard → Connect → Session pooler URI with DB password). Ask the user; don't block on it until Task 4 Step 6 / Task 7.

- [ ] **Step 3: Write failing tests** `src/lib/domain/format.test.ts`:

```ts
expect(formatKrw(85000)).toBe('85 000 ₩')
expect(formatKrw(0)).toBe('0 ₩')
expect(formatKrw(1234567)).toBe('1 234 567 ₩')
expect(formatUsd(30)).toBe('30 $')
expect(formatUsd(10.5)).toBe('10,5 $')
expect(formatWeight(250)).toBe('250 g')
expect(formatWeight(1250)).toBe('1,25 kg')
expect(formatWeight(2000)).toBe('2 kg')
expect(formatKg(1250)).toBe('1,25 kg')
expect(formatKg(300)).toBe('0,3 kg')
expect(formatDateTime('2026-10-23T15:30:00Z')).toBe('24.10.2026 00:30')
expect(formatOrderNo(123)).toBe('#000123')
expect(formatOrderNo(1234567)).toBe('#1234567')
```

- [ ] **Step 4: Run** `npm test` → FAIL (functions not defined).
- [ ] **Step 5: Implement** the formatters (manual thousands grouping with a plain space; `Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', ... formatToParts })` for dates) and the three Supabase client factories per `@supabase/ssr` docs (Next 16: `cookies()` is async).
- [ ] **Step 6: Run** `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 7: Commit** `feat: scaffold Next.js app with formatters and Supabase clients`

---

### Task 2: Domain logic — shipping, cart, phone, barcode, errors

**Files:**
- Create: `src/lib/domain/shipping.ts`, `cart.ts`, `phone.ts`, `barcode.ts`, `errors.ts` + `*.test.ts` each

**Interfaces:**
- Produces:
  - `type OrderType = 'store' | 'tekpe'`, `type Destination = 'KR' | 'UZ'`, `type PaymentMethod = 'cash' | 'card' | 'transfer'`
  - `type ShippingRates = { krShippingKrw: number; uzShippingUsdPerKg: number }`
  - `computeShipping(i: { type: OrderType; destination: Destination | null; totalWeightG: number; rates: ShippingRates }): { shippingKrw: number; shippingUsd: number; shippingKg: number }`
  - `type CartProduct = { id: string; barcode: string; name: string; photoPath: string | null; retailPrice: number; wholesalePrice: number; weightG: number; stock: number }`
  - `type CartLine = CartProduct & { qty: number; isWholesale: boolean }`
  - `type CartAction = { type: 'add'; product: CartProduct } | { type: 'setQty'; id: string; qty: number } | { type: 'inc'; id: string } | { type: 'dec'; id: string } | { type: 'toggleWholesale'; id: string } | { type: 'remove'; id: string } | { type: 'clear' }`
  - `cartReducer(lines: CartLine[], a: CartAction): CartLine[]`, `unitPrice(l: CartLine): number`, `isOverStock(l: CartLine): boolean`, `cartTotals(lines: CartLine[]): { lineCount: number; itemCount: number; totalWeightG: number; subtotal: number }`
  - `type PhoneCountry = 'KR' | 'UZ'`; `normalizePhone(raw: string, country: PhoneCountry): string | null`; `formatPhone(e164: string): string`
  - `barcodeCandidates(code: string): string[]`
  - `type ErrorCode = 'EMPTY_CART' | 'INVALID_QTY' | 'PRODUCT_NOT_FOUND' | 'TEKPE_NEEDS_DESTINATION' | 'TEKPE_NEEDS_CUSTOMER' | 'INVALID_PHONE' | 'NOT_AUTHORIZED' | 'ORDER_NOT_FOUND' | 'ORDER_ALREADY_CANCELLED' | 'INVALID_STATUS_TRANSITION' | 'INVALID_STOCK'`; `errorMessage(e: unknown): string` (reads `.message`, maps known codes to Uzbek, else generic `"Xatolik yuz berdi. Qaytadan urinib koʻring."`)

- [ ] **Step 1: Write failing tests.**

`shipping.test.ts` (rates `{ krShippingKrw: 4000, uzShippingUsdPerKg: 10 }`) — these exact cases are mirrored in SQL in Task 5:
```ts
expect(computeShipping({ type: 'store', destination: null, totalWeightG: 5000, rates })).toEqual({ shippingKrw: 0, shippingUsd: 0, shippingKg: 0 })
expect(computeShipping({ type: 'tekpe', destination: 'KR', totalWeightG: 5000, rates })).toEqual({ shippingKrw: 4000, shippingUsd: 0, shippingKg: 0 })
expect(computeShipping({ type: 'tekpe', destination: 'UZ', totalWeightG: 0, rates })).toEqual({ shippingKrw: 0, shippingUsd: 10, shippingKg: 1 })
expect(computeShipping({ type: 'tekpe', destination: 'UZ', totalWeightG: 1000, rates }).shippingKg).toBe(1)
expect(computeShipping({ type: 'tekpe', destination: 'UZ', totalWeightG: 1001, rates })).toEqual({ shippingKrw: 0, shippingUsd: 20, shippingKg: 2 })
expect(computeShipping({ type: 'tekpe', destination: 'UZ', totalWeightG: 2500, rates }).shippingUsd).toBe(30)
```

`cart.test.ts` (product A: retail 10000, wholesale 8000, weight 250, stock 5; B: retail 20000, wholesale 15000, weight 500, stock 1):
```ts
// add twice → one line qty 2
// setQty(A, 0) removes the line; setQty(A, 7) → qty 7
// dec at qty 1 keeps qty 1
// toggleWholesale(B) → unitPrice 15000
// A qty 2 retail + B qty 3 wholesale:
expect(cartTotals(lines)).toEqual({ lineCount: 2, itemCount: 5, totalWeightG: 2000, subtotal: 65000 })
expect(isOverStock(lineB)).toBe(true)   // qty 3 > stock 1
expect(isOverStock(lineA)).toBe(false)
```

`phone.test.ts`:
```ts
expect(normalizePhone('010-1234-5678', 'KR')).toBe('+821012345678')
expect(normalizePhone('01012345678', 'KR')).toBe('+821012345678')
expect(normalizePhone('+82 10 1234 5678', 'KR')).toBe('+821012345678')
expect(normalizePhone('90 123 45 67', 'UZ')).toBe('+998901234567')
expect(normalizePhone('+998901234567', 'KR')).toBe('+998901234567')
expect(normalizePhone('123', 'KR')).toBeNull()
expect(normalizePhone('', 'KR')).toBeNull()
expect(formatPhone('+821012345678')).toBe('+82 10 1234 5678')
```

`barcode.test.ts`:
```ts
expect(barcodeCandidates(' 8801234567890 ')).toEqual(['8801234567890'])
expect(barcodeCandidates('012345678905')).toEqual(['012345678905', '0012345678905'])   // UPC-A → also EAN-13
expect(barcodeCandidates('0012345678905')).toEqual(['0012345678905', '012345678905'])  // EAN-13 leading 0 → also UPC-A
expect(barcodeCandidates('ABC-123')).toEqual(['ABC-123'])
```

`errors.test.ts`:
```ts
expect(errorMessage({ message: 'ORDER_ALREADY_CANCELLED' })).toBe('Bu buyurtma allaqachon bekor qilingan')
expect(errorMessage(new Error('boom'))).toBe('Xatolik yuz berdi. Qaytadan urinib koʻring.')
```

- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement.** `normalizePhone` uses `parsePhoneNumberFromString(raw, country)` and returns `.number` only when `.isValid()`. `formatPhone` uses `formatInternational()`. Uzbek messages for every `ErrorCode` go in `uz.ts` under `errors` (e.g. `INVALID_STATUS_TRANSITION: 'Bu buyurtma holatini oʻzgartirib boʻlmaydi'`, `ORDER_NOT_FOUND: 'Buyurtma topilmadi'`).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: add shipping, cart, phone, barcode and error domain logic`

---

### Task 3: Scanner primitives — USB burst detection and camera scanner

**Files:**
- Create: `src/lib/domain/scan-burst.ts`, `scan-burst.test.ts`, `dedupe.ts`, `dedupe.test.ts`
- Create: `src/components/scanner/use-hid-scanner.ts`, `camera-scanner.tsx`, `feedback.ts`

**Interfaces:**
- Produces:
  - `createScanBurstDetector(opts?: { maxGapMs?: number; minLength?: number }): { handleKey(key: string, timeMs: number): { preventDefault: boolean; scan: string | null; burstStart: boolean } }` — defaults `maxGapMs = 35`, `minLength = 4`
  - `createDeduper(windowMs: number): (code: string, timeMs: number) => boolean` (true = accept)
  - `useHidScanner(onScan: (code: string) => void, opts?: { enabled?: boolean }): void`
  - `<CameraScanner open: boolean; onClose(): void; onScan(code: string): void; continuous?: boolean; title?: string />`
  - `scanFeedback(ok: boolean): void` (short WebAudio beep — higher pitch ok, lower error — plus `navigator.vibrate?.(ok ? 40 : [60, 40, 60])`)

**Burst algorithm** (not determined by the signature):
- Printable key = `key.length === 1`. Keep `buffer`, `lastTime`.
- Printable key: if `buffer` is non-empty and `timeMs - lastTime <= maxGapMs` → append, return `preventDefault: true`. Otherwise reset `buffer = key`, return `preventDefault: false, burstStart: true`. Update `lastTime`.
- `Enter`: if `buffer.length >= minLength` and `timeMs - lastTime <= maxGapMs * 3` → return `{ preventDefault: true, scan: buffer }` and clear. Otherwise clear and return no scan, `preventDefault: false`.
- Any other key (Shift excluded — ignore it entirely): clear buffer.

- [ ] **Step 1: Write failing tests** `scan-burst.test.ts`:
```ts
// "8801234567890" at 10 ms gaps then Enter 10 ms later:
//   first key → { preventDefault: false, burstStart: true, scan: null }
//   keys 2..13 → preventDefault true
//   Enter → { preventDefault: true, scan: '8801234567890' }
// human "abcd" at 150 ms gaps + Enter → no scan, every preventDefault false
// fast "123" + Enter → scan null (minLength 4)
// fast "1234", 500 ms pause, "x" → "x" returns burstStart true (buffer reset)
// fast "12" + 'Shift' + "34" + Enter → scan '1234'
```
`dedupe.test.ts`:
```ts
const accept = createDeduper(1500)
expect(accept('A', 0)).toBe(true)
expect(accept('A', 1000)).toBe(false)
expect(accept('B', 1100)).toBe(true)
expect(accept('A', 2600)).toBe(true)
```
- [ ] **Step 2: Run** `npm test` → FAIL.
- [ ] **Step 3: Implement** both pure modules.
- [ ] **Step 4: Implement `useHidScanner`** — `window.addEventListener('keydown', h, { capture: true })`. On `burstStart`, remember `{ target: e.target, value: target.value }` if the target is an `<input>`/`<textarea>`. On `preventDefault` call `e.preventDefault()`. On `scan`, if a remembered input exists, restore its value with the native value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)`) and dispatch `new Event('input', { bubbles: true })` so React state reverts, then call `onScan(code)`. Skip entirely when `enabled === false`.
- [ ] **Step 5: Implement `CameraScanner`** — shadcn `Dialog` (full-screen on mobile) with a `<video playsInline muted>`; `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`; `import { BarcodeDetector } from 'barcode-detector/ponyfill'` with formats `['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']`; detect on `requestAnimationFrame` throttled to ~8 fps; pass results through `createDeduper(1500)`; call `scanFeedback(true)` + `onScan`; when `continuous` is false, close after the first scan. Errors: `NotAllowedError` → show `uz.scanner.permissionDenied` ("Kameraga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering."); no camera / insecure context → `uz.scanner.unavailable`. Stop all tracks on close/unmount.
- [ ] **Step 6: Run** `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 7: Commit** `feat: add USB scan burst detection and camera scanner`

---

### Task 4: Database schema, RLS, storage, realtime

**Files:**
- Create: `supabase/migrations/20261023000001_schema.sql`
- Create: `supabase/tests/_helpers.sql`, `supabase/tests/01_rls.sql`, `scripts/run-db-tests.mjs`
- Create: `src/lib/database.types.ts` (generated)

**Interfaces:**
- Produces (exact names, used by every later task):
  - Enums: `app_role ('admin','owner','seller')`, `order_type ('store','tekpe')`, `destination ('KR','UZ')`, `payment_method ('cash','card','transfer')`, `order_status ('completed','new','ready','picked_up','cancelled')`, `movement_kind ('restock','sale','cancel','adjust')`
  - Tables exactly as spec §5: `profiles`, `products`, `stock_movements`, `customers`, `orders` (incl. `request_id uuid unique`, `qr_token text unique`), `order_items`, `app_settings` (single row: `id boolean primary key default true check (id)`, `kr_shipping_krw int not null default 4000`, `uz_shipping_usd_per_kg numeric(10,2) not null default 10`, `updated_at`). No `app_secrets` yet (Phase 2).
  - FKs: `orders.seller_id → profiles(id)` (constraint name `orders_seller_id_fkey`), `orders.customer_id → customers(id)`, `order_items.order_id → orders(id) on delete cascade`, `order_items.product_id → products(id)`, `stock_movements.product_id → products(id)`, `ready_by/picked_up_by/cancelled_by → profiles(id)`.
  - Sequence `order_no_seq` (start 1); `orders.order_no bigint not null unique default nextval('order_no_seq')`.
  - Indexes: `products(barcode)` unique, `products using gin (name gin_trgm_ops)` (enable `pg_trgm`), `orders(created_at desc)`, `orders(status)`, `orders(seller_id)`, `customers(phone)` unique.
  - `public.app_role() returns app_role` — role of `auth.uid()` from `profiles` where `is_active`, else null; `stable security definer set search_path = ''`.
  - Trigger `on_auth_user_created` on `auth.users` → `public.handle_new_user()` inserts `profiles(id, username, full_name, role)` from `raw_user_meta_data` (`username`, `full_name`, `role`, role default `'seller'`).
  - View `public.inventory_summary` (`with (security_invoker = on)`): `cost_value`, `retail_value`, `wholesale_value` = Σ price × `greatest(stock,0)` over non-archived products.
  - Storage bucket `product-photos` (public read; insert/update/delete only when `app_role() in ('owner','seller')`).
  - Realtime: `alter publication supabase_realtime add table public.products, public.orders;`
- RLS / grants:
  - `products`: select/insert/update for `app_role() in ('owner','seller')`; no delete. Column grants: revoke table-level insert/update from `authenticated`, then `grant insert (barcode,name,photo_path,cost_price,retail_price,wholesale_price,weight_g,low_stock_threshold)` and `grant update (name,photo_path,cost_price,retail_price,wholesale_price,weight_g,low_stock_threshold,is_archived)` — **stock and barcode are not directly updatable**.
  - `customers`, `orders`, `order_items`, `stock_movements`: select for owner/seller; no insert/update/delete grants (writes only via Task 5 RPCs).
  - `profiles`: select own row for anyone authenticated; select all for owner/seller/admin; update only by admin (role, full_name, is_active).
  - `app_settings`: select for any active role; update only admin.
  - `anon`: nothing.

- [ ] **Step 1: Write `supabase/tests/_helpers.sql`** defining temp helpers (concatenated before each test file by the runner):
  - `pg_temp.make_user(p_role text, p_active boolean default true) returns uuid` — inserts into `auth.users (id, instance_id, aud, role, email, raw_user_meta_data)` with a random id, `username = 'u_' || left(id::text, 8)`; sets `profiles.is_active` per arg.
  - `pg_temp.login_as(p_uid uuid)` — `perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true); set local role authenticated;`
  - `pg_temp.logout()` — `reset role;`
  - `pg_temp.make_product(p_barcode text, p_stock int, p_cost int, p_retail int, p_wholesale int, p_weight int) returns uuid` (inserted as postgres).
  - Fixtures (`make_user`, `make_product`, direct `update`s) must run while logged out — call them before `login_as` or after `logout`, since `login_as` switches to the `authenticated` role.
- [ ] **Step 2: Write failing test `supabase/tests/01_rls.sql`** — one `do $$ ... $$` block per case using `assert`, expecting errors via `begin ... exception when insufficient_privilege or others then ... end`:
  - seller can `select` products (count ≥ 1 after make_product)
  - seller can `update products set name = 'X'`
  - seller `update products set stock = 99` → raises (permission denied)
  - seller `insert into orders` → raises
  - seller `update app_settings` → 0 rows changed or raises; admin update succeeds
  - admin `select count(*) from products` = 0 (RLS hides)
  - inactive seller `select count(*) from products` = 0
  - `select * from inventory_summary` as seller with products (cost 6000, stock 3) and (cost 12000, stock -2) → `cost_value = 18000`
- [ ] **Step 3: Write `scripts/run-db-tests.mjs`** — for each `supabase/tests/[0-9]*.sql` (sorted): connect with `pg` to `SUPABASE_DB_URL`, run `begin;` + `_helpers.sql` + file + `rollback;`, print `PASS <file>` or `FAIL <file>: <error>`; exit 1 on any failure. Without `SUPABASE_DB_URL`, the executor may instead run the same concatenation through MCP `execute_sql` on project `zeekxqinioeyrjyhuajw`.
- [ ] **Step 4: Run** `npm run test:db` → FAIL (tables don't exist).
- [ ] **Step 5: Write the migration** and apply it with MCP `apply_migration` (name `schema`), saving the identical SQL to `supabase/migrations/20261023000001_schema.sql`. Insert the single `app_settings` row.
- [ ] **Step 6: Run** `npm run test:db` → `PASS 01_rls.sql`. Run MCP `get_advisors` (security) → no errors for our tables.
- [ ] **Step 7: Generate types** with MCP `generate_typescript_types` → `src/lib/database.types.ts`; `npm run build` passes.
- [ ] **Step 8: Commit** `feat: add database schema, RLS, storage bucket and realtime`

---

### Task 5: Database functions (RPC)

**Files:**
- Create: `supabase/migrations/20261023000002_functions.sql`
- Create: `supabase/tests/02_create_order.sql`, `03_cancel_status.sql`, `04_stock.sql`
- Modify: `src/lib/database.types.ts` (regenerate)

**Interfaces:**
- Consumes: Task 4 tables, `app_role()`.
- Produces (all `security definer set search_path = ''`, `grant execute ... to authenticated`, revoke from `public, anon`; each starts with `if public.app_role() not in ('owner','seller') or public.app_role() is null then raise exception 'NOT_AUTHORIZED'`):
  - `create_order(p_request_id uuid, p_items jsonb, p_customer_phone text, p_customer_name text, p_payment_method payment_method, p_type order_type, p_destination destination) returns public.orders` — `p_items` = `[{ "product_id": uuid, "qty": int, "is_wholesale": bool }]`
  - `cancel_order(p_order_id uuid) returns public.orders`
  - `set_order_status(p_order_id uuid, p_status order_status) returns public.orders`
  - `restock_product(p_product_id uuid, p_qty int, p_cost_price int default null) returns public.products`
  - `adjust_stock(p_product_id uuid, p_new_stock int) returns public.products`
  - `generate_qr_token() returns text` (internal; not granted) — 10 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` via `extensions.gen_random_bytes`, retry on collision.

**`create_order` rules** (in order): existing order with `request_id` → return it unchanged. Empty array → `EMPTY_CART`. Any qty not a positive integer → `INVALID_QTY`. Tekpe without destination → `TEKPE_NEEDS_DESTINATION`; tekpe without phone or blank name → `TEKPE_NEEDS_CUSTOMER`; store forces destination null. Phone present but not `^\+[1-9][0-9]{7,14}$` → `INVALID_PHONE`. Lock products `for update` ordered by id; missing or archived → `PRODUCT_NOT_FOUND`. Duplicate product ids in `p_items` are summed. Customer upsert on phone: insert with name; on conflict update name only when the new name is non-blank. Snapshot each line into `order_items`; decrement stock (may go negative); one `sale` movement per line with `qty_change = -qty`. Shipping exactly like `computeShipping` (Task 2), rates read from `app_settings`. Status `completed` for store, `new` for tekpe.

- [ ] **Step 1: Write failing tests** `02_create_order.sql` — fixtures: A (`retail 10000, wholesale 8000, cost 6000, weight 250, stock 5`), B (`20000, 15000, 12000, 500, stock 1`); items `[A×2 retail, B×3 wholesale]`, logged in as a seller:
  - store order: `status='completed'`, `item_count=5`, `line_count=2`, `total_weight_g=2000`, `subtotal=65000`, `cost_total=48000`, shipping all 0, `seller_id` = caller, `qr_token ~ '^[A-HJ-NP-Z2-9]{10}$'`; A stock 3, B stock -2; 2 `sale` movements
  - tekpe UZ (+ phone `+821012345678`, name `Dilnoza`): `status='new'`, `shipping_kg=2`, `shipping_usd=20`, `shipping_krw=0`
  - tekpe KR: `shipping_krw=4000`
  - tekpe without destination → `TEKPE_NEEDS_DESTINATION`; tekpe with null phone → `TEKPE_NEEDS_CUSTOMER`
  - **idempotency:** same `p_request_id` twice → same `id`, A stock decremented once, one order row
  - `[]` → `EMPTY_CART`; qty 0 → `INVALID_QTY`; phone `'010'` → `INVALID_PHONE`
  - customer: new phone creates customer named `Dilnoza`; second order same phone with blank name keeps `Dilnoza` and the same `customer_id`; third with `Dilnoza K.` renames
  - snapshot: after `update products set retail_price = 99999` (as postgres), the order's `order_items.unit_price` for A is still 10000
  - archived product → `PRODUCT_NOT_FOUND`
  - admin caller → `NOT_AUTHORIZED`; inactive seller → `NOT_AUTHORIZED`

  `03_cancel_status.sql`:
  - cancel store order → `status='cancelled'`, `cancelled_by` = caller, A stock back to 5, B back to 1, 2 `cancel` movements
  - **cancel again → `ORDER_ALREADY_CANCELLED`, stock unchanged**
  - tekpe `new → ready` sets `ready_at`, `ready_by`; `ready → picked_up` sets `picked_up_at`, `picked_up_by`
  - `new → picked_up`, store `completed → ready`, `cancelled → ready` → `INVALID_STATUS_TRANSITION`
  - unknown id → `ORDER_NOT_FOUND`

  `04_stock.sql`:
  - `restock_product(A, 10, 6500)` → stock +10, `cost_price=6500`, one `restock` movement with `qty_change=10, cost_price=6500`
  - `restock_product(A, 10)` keeps the cost price; `restock_product(A, 0)` → `INVALID_QTY`
  - `adjust_stock(A, 37)` from 30 → stock 37, `adjust` movement `+7`; `adjust_stock(A, 37)` again → no movement; `adjust_stock(A, -1)` → `INVALID_STOCK`
- [ ] **Step 2: Run** `npm run test:db` → 02–04 FAIL.
- [ ] **Step 3: Write the functions migration**, apply with MCP `apply_migration` (name `functions`), save the identical file. `cancel_order` locks the order row `for update` before checking status.
- [ ] **Step 4: Run** `npm run test:db` → all PASS. MCP `get_advisors` (security) → no new errors.
- [ ] **Step 5: Regenerate types**; `npm run build` passes.
- [ ] **Step 6: Commit** `feat: add order, stock and status RPC functions`

---

### Task 6: Design system, auth, and app shell

**Files:**
- Create: `src/lib/i18n/uz.ts`, `src/lib/auth/username.ts` (+ test), `src/lib/auth/session.ts`, `src/proxy.ts`
- Create: `src/app/login/page.tsx`, `src/app/(pos)/layout.tsx`, `src/app/admin/layout.tsx`, `src/components/shell/app-shell.tsx`, `nav-items.ts`, `src/components/money.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: Task 1 clients, Task 4 `profiles`.
- Produces:
  - `usernameToEmail(u: string): string` → `${u.trim().toLowerCase()}@unitybeauty.local`
  - `type SessionProfile = { id: string; username: string; fullName: string; role: 'admin' | 'owner' | 'seller' }`
  - `getSessionProfile(): Promise<SessionProfile | null>` (server; null if no user or inactive)
  - `requireRole(roles: SessionProfile['role'][]): Promise<SessionProfile>` (server; redirects to `/login` when signed out, admin → `/admin`, owner/seller → `/`)
  - `uz` dictionary object (nested by screen: `nav`, `login`, `checkout`, `inventory`, `orders`, `tekpe`, `admin`, `scanner`, `errors`, `common`)
  - `<Krw value/>`, `<Usd value/>`, `<Weight grams/>` using Task 1 formatters
  - Nav: Kassa `/`, Ombor `/ombor`, Buyurtmalar `/buyurtmalar`, Tekpe `/tekpe` (Statistika and Bildirishnomalar are Phase 2 — leave them out)
  - `useOnline(): boolean` (`src/components/shell/use-online.ts`, `navigator.onLine` + `online`/`offline` events); the shell shows a banner `uz.common.offline` ("Internet yoʻq") while false

- [ ] **Step 1: Write failing test** `username.test.ts`: `expect(usernameToEmail(' Ali.Seller ')).toBe('ali.seller@unitybeauty.local')`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** → PASS.
- [ ] **Step 4: Design tokens** — invoke `/impeccable` with the spec §10 brief (counter-speed POS, beauty brand, `#fcf2f0` background, `#f8ad9d` primary with dark text, Uzbek Latin with ʻ/ʼ) to choose font (via `next/font`), type scale, radii and neutral/semantic colors; put them in `globals.css` as Tailwind 4 `@theme` tokens and map shadcn CSS variables to them. Add a shadcn `sonner` Toaster in the root layout. Install shadcn components used later: `button input label dialog sheet tabs table select checkbox badge card toggle dropdown-menu sonner skeleton`.
- [ ] **Step 5: Auth** — `proxy.ts` refreshes the Supabase session (per `@supabase/ssr` Next 16 guide) and redirects unauthenticated requests to `/login` (allow `/login` and static assets). Login page: username + password + submit; `signInWithPassword({ email: usernameToEmail(u), password })`; on failure show `uz.login.invalid` ("Login yoki parol notoʻgʻri"); on success `router.replace('/')`. `(pos)/layout.tsx` calls `requireRole(['owner','seller'])`; `admin/layout.tsx` calls `requireRole(['admin'])`.
- [ ] **Step 6: App shell** — desktop (≥1024px): left sidebar with logo (`/brand/unity.png` once Task 9 creates it; use text "Unity Beauty" until then), nav items, user name + Chiqish (sign out). Mobile: bottom nav with the 4 items. Active item highlighted. Keyboard focus visible.
- [ ] **Step 7: Verify** — `npm run build` passes; `npm run dev`, visit `/` → redirected to `/login`.
- [ ] **Step 8: Commit** `feat: add design tokens, login, role guards and app shell`

---

### Task 7: Admin — accounts and settings

**Files:**
- Create: `src/features/admin/validate.ts` (+ test), `actions.ts`, `accounts-table.tsx`, `account-dialog.tsx`, `settings-form.tsx`
- Create: `src/app/admin/page.tsx`, `src/app/admin/sozlamalar/page.tsx`, `src/lib/data/settings.ts`
- Create: `scripts/create-admin.mjs`

**Interfaces:**
- Consumes: `supabaseAdmin()`, `requireRole`, `usernameToEmail`, `profiles`, `app_settings`.
- Produces:
  - `validateUsername(u: string): string | null` (error message or null; rule `^[a-z0-9._-]{3,32}$` after trim/lowercase), `validatePassword(p: string): string | null` (min 8 chars)
  - Server actions (`'use server'`, each first calls `requireRole(['admin'])`, returns `{ ok: true } | { ok: false; error: string }`): `createAccount(input: { username: string; fullName: string; password: string; role: 'owner' | 'seller' | 'admin' })`, `resetPassword(userId: string, password: string)`, `setRole(userId: string, role: 'owner' | 'seller' | 'admin')`, `setActive(userId: string, active: boolean)`, `updateSettings(input: { krShippingKrw: number; uzShippingUsdPerKg: number })`
  - `getShippingRates(): Promise<ShippingRates>` (data/settings.ts, works in server and client via passed client)

- [ ] **Step 1: Write failing tests** `validate.test.ts`: `validateUsername('ab')` → error; `validateUsername('Ali.Seller')` → null; `validateUsername('ali seller')` → error; `validatePassword('1234567')` → error; `validatePassword('12345678')` → null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** → PASS.
- [ ] **Step 4: Implement actions.** `createAccount` → `auth.admin.createUser({ email: usernameToEmail(u), password, email_confirm: true, user_metadata: { username, full_name, role } })` (the Task 4 trigger creates the profile). `setActive(false)` → `profiles.is_active = false` **and** `auth.admin.updateUserById(id, { ban_duration: '876000h' })`; `true` → `ban_duration: 'none'`. An admin can't disable or demote their own account (return error `uz.admin.cannotChangeSelf`). Duplicate username → `uz.admin.usernameTaken`.
- [ ] **Step 5: UI** — accounts table (username, full name, role badge, active switch, created date) with "Yangi akkaunt" dialog and per-row menu (parolni tiklash, rolni oʻzgartirish). Settings page with the two rate fields. Admin header has links Akkauntlar / Sozlamalar and Chiqish.
- [ ] **Step 6: `scripts/create-admin.mjs`** — reads `.env.local`, prompts for username, full name, password (stdin, hidden), creates the user with role `admin` via the secret key. **User action:** the user runs `node scripts/create-admin.mjs` themselves to create their real admin account. For testing, the executor creates throwaway accounts `e2e_admin`, `e2e_seller` with generated passwords saved to `.env.test.local` (gitignored, keys `E2E_ADMIN_USER/PASS`, `E2E_SELLER_USER/PASS`).
- [ ] **Step 7: Disable public sign-up** — **user action:** Supabase Dashboard → Authentication → Sign In / Providers → turn off "Allow new users to sign up".
- [ ] **Step 8: Verify manually** — log in as `e2e_admin` → lands on `/admin`; create a seller; disable it → its login fails; re-enable → works; change KR rate to 4500 and back to 4000.
- [ ] **Step 9: Commit** `feat: add admin accounts and settings`

---

### Task 8: Inventory (Ombor)

**Files:**
- Create: `src/lib/data/products.ts`, `src/lib/data/storage.ts`
- Create: `src/features/inventory/*` (see File Structure), `src/app/(pos)/ombor/page.tsx`

**Interfaces:**
- Consumes: `barcodeCandidates`, `useHidScanner`, `CameraScanner`, RPCs `restock_product`, `adjust_stock`, view `inventory_summary`, bucket `product-photos`.
- Produces:
  - `type Product = Database['public']['Tables']['products']['Row']`
  - `findProductByBarcode(sb, code: string): Promise<Product | null>` — `.in('barcode', barcodeCandidates(code)).eq('is_archived', false).maybeSingle()` (first match)
  - `searchProducts(sb, q: string, limit = 8): Promise<Product[]>` — name `ilike %q%` or barcode prefix, non-archived
  - `listProducts(sb): Promise<Product[]>`; `getInventorySummary(sb): Promise<{ costValue: number; retailValue: number; wholesaleValue: number }>`
  - `photoUrl(path: string | null): string | null` (public URL); `uploadProductPhoto(sb, productId: string, file: Blob): Promise<string>` (path `products/<productId>/<timestamp>.jpg`)
  - `resizeImage(file: File, maxSide = 800, quality = 0.8): Promise<Blob>` (canvas → JPEG)
  - `<CameraScanner/>` and `useHidScanner` reused unchanged

- [ ] **Step 1: Screen** — `inventory-screen.tsx` (client) loads products + summary; subscribes to Realtime `postgres_changes` on `products` and refetches the summary on change. Summary cards per spec §6.2 with `<Krw/>`.
- [ ] **Step 2: Table** — columns per spec §6.2; search box filters client-side by name/barcode; sort by name or stock; rows with `stock <= low_stock_threshold` get a warning style and badge `uz.inventory.low` ("Kam qoldi"). Mobile: card list instead of table.
- [ ] **Step 3: `StockStepper`** — `−10` / number / `+10`. Clicking the number turns it into an input (Enter or blur commits, Escape cancels). Each commit calls `adjust_stock(id, newStock)`; buttons are disabled while a call is in flight; negative results are clamped at 0 client-side; errors toast `errorMessage(e)`.
- [ ] **Step 4: Add product flow** — "Mahsulot qoʻshish" opens a dialog: barcode input (auto-focus) + camera button; `useHidScanner` fills it while the dialog is open. On submit → `findProductByBarcode`:
  - found → `RestockDialog`: photo, name, current stock, qty input with −10/+10 (default 10), optional new cost price → `restock_product`.
  - not found → `ProductForm`: barcode (prefilled, read-only), name*, photo (file input `accept="image/*" capture="environment"`), cost*, retail*, wholesale*, weight (g)*, starting qty (default 0), threshold (default 10). All prices/weight integers ≥ 0. Save = insert product → upload photo (if any) and update `photo_path` → `restock_product(id, qty)` when qty > 0. Unique barcode violation (`23505`) → `uz.inventory.barcodeExists`.
- [ ] **Step 5: Edit / archive** — row menu: Tahrirlash (same `ProductForm`, barcode read-only, no starting qty) and Arxivlash (confirm dialog → `is_archived = true`).
- [ ] **Step 6: Verify manually** (logged in as `e2e_seller`) — add product with barcode `E2E0000000001` and a photo; scan/type it again → restock dialog adds 10; stepper ±10 and direct edit to 37 persist across reload; summary values match `Σ price × stock`; open a second browser tab → stock change appears there without reload; on a phone-size viewport the camera button opens the scanner.
- [ ] **Step 7: Commit** `feat: add inventory screen with scan-to-add, restock and stock stepper`

---

### Task 9: Printed order sheet and printing

**Files:**
- Create: `scripts/prepare-logos.mjs` → `public/brand/unity.png`, `public/brand/nura.png`
- Create: `src/lib/data/orders.ts` (`getOrderWithItems` here; list functions added in Task 11)
- Create: `src/features/print/order-sheet.tsx`, `print-order.ts`, `autoprint.tsx`, `src/app/print/[id]/page.tsx`

**Interfaces:**
- Consumes: formatters, `photoUrl`, `formatPhone`, `formatOrderNo`.
- Produces:
  - `type OrderWithItems = Order & { items: OrderItem[]; customer: { name: string | null; phone: string } | null; seller: { full_name: string } | null }`
  - `getOrderWithItems(sb, id: string): Promise<OrderWithItems | null>`
  - `printOrder(orderId: string): void` — `window.unityDesktop?.print(orderId)` when present (Phase 2 Electron); else on coarse-pointer devices `window.open('/print/' + id + '?autoprint=1')`; else a hidden `<iframe src="/print/<id>?autoprint=1">` that prints itself and is removed after `afterprint`
  - Global type: `interface Window { unityDesktop?: { print(orderId: string): Promise<void> } }`

- [ ] **Step 1: Logos** — `prepare-logos.mjs` with `sharp`: `Nura.png` → set alpha to 0 for every pixel with alpha < 96 (removes the speckle halo), trim, resize to width 600 → `public/brand/nura.png`; `Unity.png` → trim the white border, resize to height 400 → `public/brand/unity.png`. Run it; view both outputs with the Read tool — no visible speckles around Nura.
- [ ] **Step 2: Sheet** — `/print/[id]` server page (`requireRole(['owner','seller'])`) renders `OrderSheet`; QR made server-side with `QRCode.toDataURL(order.qr_token, { margin: 1, width: 220, errorCorrectionLevel: 'M' })`. Layout per spec §8: header (both logos, order no, date, customer, type/destination), the 7-column table, summary (`<N> ta mahsulot`, total qty, total weight in kg, subtotal, shipping — UZ shows `<kg> kg × <rate> $`, KR shows `4 000 ₩` — total two-part for UZ `85 000 ₩ + 20 $`, payment method), QR in a corner. Product photos at 40px with `filter: grayscale(1)`. CSS: `@page { size: A4 portrait; margin: 12mm }`, `thead { display: table-header-group }`, `tr { break-inside: avoid }`. The page `<title>` is just the order number. No cost, seller, or system name anywhere.
- [ ] **Step 3: Autoprint + helper** — `autoprint.tsx` (client) calls `window.print()` after images load when `?autoprint=1`. Implement `printOrder`.
- [ ] **Step 4: Verify** — create a tekpe UZ order with 2 products via MCP `execute_sql` (as postgres, calling `create_order` after setting the JWT claim to `e2e_seller`), open `/print/<id>`: check every spec §8 field; Chrome print preview fits A4 in black-and-white; scan the on-screen QR with a phone camera app → shows only the 10-char token. Create a 40-line order → header row repeats on page 2.
- [ ] **Step 5: Commit** `feat: add A4 order sheet with private QR and print helper`

---

### Task 10: Checkout (Kassa)

**Files:**
- Create: `src/features/checkout/*`, `src/lib/data/customers.ts`
- Modify: `src/app/(pos)/page.tsx`

**Interfaces:**
- Consumes: `cartReducer`, `cartTotals`, `unitPrice`, `isOverStock`, `computeShipping`, `normalizePhone`, `findProductByBarcode`, `searchProducts`, `useHidScanner`, `CameraScanner`, `scanFeedback`, `getShippingRates`, RPC `create_order`, `printOrder`, `errorMessage`.
- Produces:
  - `useCart(): { lines: CartLine[]; dispatch: Dispatch<CartAction>; totals: ReturnType<typeof cartTotals> }` — `useReducer` persisted to `sessionStorage` key `unity.cart` (survives an accidental reload)
  - `lookupCustomer(sb, e164: string): Promise<{ id: string; name: string | null; orderCount: number } | null>` (`customers.select('id,name,orders(count)')`)

- [ ] **Step 1: Cart side** — `useHidScanner(onScan)` active on this screen; `onScan` → `findProductByBarcode` → `dispatch({ type: 'add' })` + `scanFeedback(true)`; not found → `scanFeedback(false)` + toast `uz.checkout.notFound` ("Mahsulot topilmadi") with action "Omborga qoʻshish" linking to `/ombor`. `ProductSearch`: debounced (200 ms) `searchProducts`; arrow keys + Enter select; Enter on text that matches a barcode exactly adds it. `CartRow`: photo, name, `<Krw value={unitPrice(line)}/>`, "Optom" toggle (`aria-pressed`), qty `−`/input/`+`, line total, remove; `isOverStock` → inline warning `Omborda ${stock} ta qoldi`. Empty state text `uz.checkout.empty`. Shortcuts: F2 focuses search, F9 triggers Checkout.
- [ ] **Step 2: Customer panel** — country toggle KR (default) / UZ + phone input; on blur or when `normalizePhone` becomes non-null → `lookupCustomer`; a match fills the name if empty and shows `Doimiy mijoz · ${orderCount} ta buyurtma`. Name input. Payment segmented control Naqd / Karta / Oʻtkazma (default Naqd). Totals block: item count, `<Weight/>`, subtotal. Buttons: **Checkout** (primary, large) and **Tekpe** (secondary). Both disabled when the cart is empty, a submit is in flight, or `useOnline()` is false.
- [ ] **Step 3: Submit** — keep `requestId = crypto.randomUUID()` in a ref, created when the cart first gets an item and **reused for every retry until success**, then reset. Checkout → `create_order(requestId, items, phone|null, name|null, payment, 'store', null)`. Tekpe → `TekpeDialog`: destination Koreya / Oʻzbekiston, shows `computeShipping` result and the final total (two-part for UZ), requires valid phone + name (inline errors), confirm → `create_order(..., 'tekpe', dest)`. On network failure show the error with a "Qayta urinish" button that resends with the same `requestId`.
- [ ] **Step 4: Success** — `SuccessDialog`: big order number, total, buttons **Chop etish** (`printOrder(id)`) and **Yangi buyurtma** (clears the cart, customer and payment; focus back to page). Enter = Yangi buyurtma.
- [ ] **Step 5: Mobile** — single column: search + camera button (`CameraScanner continuous`) on top, cart list, sticky bottom bar with total and "Davom etish" opening a `Sheet` with the customer panel and both buttons.
- [ ] **Step 6: Verify manually** —
  - USB-scanner simulation: in DevTools console dispatch fast keydown events for `E2E0000000001` + Enter while focus is **in the phone input** → product added, phone input unchanged (Review Focus 1).
  - Scan the same product twice → qty 2. Optom toggle changes price and totals.
  - Qty above stock shows warning; checkout still succeeds.
  - Double-click Checkout quickly → one order in the DB (Review Focus 3).
  - Phone `010-1234-5678` then later `+82 10 1234 5678` → second time shows "Doimiy mijoz · 1 ta buyurtma" (Review Focus 4).
  - Tekpe UZ with a 1.2 kg cart → dialog shows `2 kg`, `20 $`, total `… ₩ + 20 $`.
  - Phone viewport: camera scanning adds items continuously; denied camera permission shows the message.
- [ ] **Step 7: Commit** `feat: add checkout screen with scanning, customers, payments and tekpe`

---

### Task 11: Orders (Buyurtmalar)

**Files:**
- Create: `src/features/orders/*`, `src/app/(pos)/buyurtmalar/page.tsx`, `src/app/(pos)/buyurtmalar/[id]/page.tsx`
- Modify: `src/lib/data/orders.ts`

**Interfaces:**
- Consumes: `getOrderWithItems`, `printOrder`, RPC `cancel_order`, formatters.
- Produces:
  - `type OrderFilters = { status?: OrderStatus; type?: OrderType; sellerId?: string; from?: string; to?: string; q?: string; page?: number }` (read from / written to URL search params)
  - `listOrders(sb, f: OrderFilters, pageSize = 50): Promise<{ rows: OrderListRow[]; total: number }>` — joins `customer:customers(name,phone)` and `seller:profiles!orders_seller_id_fkey(full_name)`; `q` matches order number (digits, `#` stripped) or customer phone (normalized via `normalizePhone(q,'KR')`, falling back to raw); dates interpreted as Asia/Seoul day bounds; ordered `created_at desc`

- [ ] **Step 1: List** — table per spec §6.3 (mobile: cards), status badges with Uzbek labels (`Bajarildi`, `Yangi`, `Tayyor`, `Olib ketildi`, `Bekor qilingan`), type label `Doʻkon` / `Tekpe · Koreya|Oʻzbekiston`, total (two-part for UZ). Filters bar (status, type, seller, date range, search) bound to URL params; pagination.
- [ ] **Step 2: Detail** — `/buyurtmalar/[id]`: same data as the printed sheet plus seller and status timeline (created, ready, picked up, cancelled with who/when). Buttons **Chop etish** and **Bekor qilish** (hidden for cancelled; confirm dialog "Buyurtma bekor qilinsinmi? Mahsulotlar omborga qaytariladi."). After cancel → refresh; `ORDER_ALREADY_CANCELLED` shows its message (Review Focus 5).
- [ ] **Step 3: Verify manually** — filters narrow results and survive reload; search `#000001` and by phone works; cancel restores stock in Ombor; cancelling in two tabs → second tab shows "Bu buyurtma allaqachon bekor qilingan" and stock is restored once.
- [ ] **Step 4: Commit** `feat: add orders list, detail, print and cancel`

---

### Task 12: Tekpe board

**Files:**
- Create: `src/features/tekpe/tekpe-screen.tsx`, `ready-scan-dialog.tsx`, `src/app/(pos)/tekpe/page.tsx`

**Interfaces:**
- Consumes: `listOrders` (type `tekpe`), RPC `set_order_status`, `useHidScanner`, `CameraScanner`, `scanFeedback`, `printOrder`, `errorMessage`.
- Produces: nothing used by other tasks.

- [ ] **Step 1: Board** — tabs Yangi / Tayyor / Olib ketildi with live counts (Realtime on `orders`). Rows: order no, date, customer, destination, item count, weight, total; per-row actions: "Tayyor" (in Yangi), "Olib ketildi" (in Tayyor), print, open detail. Tayyor tab has checkboxes + bulk **Tekpe olib ketdi** button (calls `set_order_status` per selected order; reports how many succeeded).
- [ ] **Step 2: Ready scan mode** — **Tayyor buyurtmalar** button opens `ReadyScanDialog`: listens with `useHidScanner` and offers a camera button (`CameraScanner continuous`). Each scanned token (trimmed, uppercased) → `orders.select(...).eq('qr_token', token).maybeSingle()`:
  - not found → error feedback, `uz.tekpe.unknownCode` ("Bu kod boʻyicha buyurtma topilmadi")
  - `new` → card with order summary + **Tasdiqlash** (Enter confirms) → `set_order_status(id,'ready')`, success feedback, card moves to a "Tasdiqlandi" list in the dialog
  - `ready` → message `uz.tekpe.alreadyReady` ("Bu buyurtma allaqachon tayyor") + button **Olib ketildi** → `picked_up`
  - `picked_up` / `cancelled` / store order → message with its status, no action
- [ ] **Step 3: Verify manually** — create 2 tekpe orders, print one; scan its QR from the printed sheet (or the `/print` screen) with the USB scanner on desktop and with the phone camera → becomes Tayyor; scan again → "allaqachon tayyor" with Olib ketildi; bulk-mark the other after manual Tayyor; counts update live in a second tab.
- [ ] **Step 4: Commit** `feat: add tekpe board with QR ready scanning`

---

### Task 13: End-to-end smoke test, deploy docs, final pass

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`, `supabase/e2e-cleanup.sql`, `README.md`

**Interfaces:**
- Consumes: everything; `.env.test.local` credentials from Task 7.

- [ ] **Step 1: Write `e2e/smoke.spec.ts`** (Playwright, `baseURL` `http://localhost:3000`, `webServer: npm run dev`):
  - log in as `E2E_SELLER_USER` → sees Kassa
  - Ombor → add product `E2E` + timestamp barcode, retail 10000, wholesale 8000, cost 6000, weight 600, qty 20 → row visible with stock 20
  - Kassa → type the barcode in search + Enter → cart line; Optom on → line shows `8 000 ₩`
  - Tekpe → Oʻzbekiston, phone `01012345678`, name `E2E Mijoz` → success dialog shows `#` order number; total contains `+ 10 $`
  - `/print/<id>` contains the order number, `E2E Mijoz`, `0,6 kg`, and no text `6 000` (cost hidden)
  - Tekpe board → order in Yangi → "Tayyor" → appears in Tayyor
  - Ombor → stock now 19
- [ ] **Step 2: Run** `npm run e2e` → PASS. Then run `supabase/e2e-cleanup.sql` through MCP `execute_sql` (deletes `order_items`/`orders`/`stock_movements`/`products` linked to barcodes `like 'E2E%'` and customers named `E2E%`).
- [ ] **Step 3: Full verification** — `npm test`, `npm run test:db`, `npm run build`, `npm run lint` all pass. Run `/web-design-guidelines` over `src/app` and `src/features` and fix anything flagged at error level.
- [ ] **Step 4: README** — setup (Node 24, `npm i`, `.env.local` from `.env.example`), scripts, creating the first admin (`node scripts/create-admin.mjs`), turning off public sign-up, and deploy: push to GitHub → import in Vercel → set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` → deploy; then add the Vercel URL in Supabase Auth → URL Configuration → Site URL.
- [ ] **Step 5: Commit** `test: add e2e smoke test and deployment README`

---

## Spec coverage (Phase 1)

| Spec | Task |
|---|---|
| §2 language, currency, timezone, online-only | Global Constraints, 1, 6 |
| §3 roles, username login, admin-only accounts | 4, 6, 7 |
| §4 stack, RPC writes, camera scanning, Supabase project | 1, 3, 4, 5 |
| §5 data model, functions, RLS | 4, 5 |
| §6.1 Kassa | 10 |
| §6.2 Ombor | 8 |
| §6.3 Buyurtmalar | 11 |
| §6.4 Tekpe | 12 |
| §6.7 Admin (accounts, shipping rates) | 7 (Telegram settings → Phase 2) |
| §7 shipping & totals | 2, 5, 10 |
| §8 printed sheet, private QR, B/W logos | 9 |
| §10 design direction | 6 (+ `/impeccable` in UI tasks) |
| §11 error handling (atomic, idempotent retry, concurrency, scan errors, offline banner) | 5, 6, 10, 11, 12 |
| §12 testing | 1–5 unit/DB, 13 e2e |
| §6.5 Statistika, §6.6 Bildirishnomalar/Telegram, §9 Electron | Phase 2 plan |
