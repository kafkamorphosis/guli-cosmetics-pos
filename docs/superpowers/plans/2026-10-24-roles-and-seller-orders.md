# Roles and Seller Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split staff into managers (the store) and sellers (remote Tekpe orders that a manager approves), with root unchanged.

**Architecture:** The database owns the rules. `owner` is renamed `manager`; every store RPC and table policy becomes manager-only; sellers read and write only through new SECURITY DEFINER RPCs that never return cost. Seller orders are ordinary `orders` rows with a new `pending` status that holds no stock until `approve_order`. The Next app picks a menu per role in one shared layout and guards each page with `requireRole`.

**Tech Stack:** Next.js 16.4 App Router (read `node_modules/next/dist/docs/` before Next-specific code), React 19, TypeScript, Tailwind 4, Supabase (Postgres RLS, RPCs, Realtime), Vitest; SQL tests run via `scripts/run-db-tests.mjs` or the Supabase MCP `execute_sql` with `_helpers.sql` prepended inside `begin … rollback`.

**Spec:** `docs/superpowers/specs/2026-10-24-roles-and-seller-orders-design.md`

## Global Constraints

- Uzbek (Latin) copy with ʻ (U+02BB) / ʼ (U+02BC); new copy lives in `src/lib/i18n/uz.ts`.
- Role labels: `admin` → "Root", `manager` → "Menejer", `seller` → "Sotuvchi". Status `pending` → "Tasdiq kutilmoqda".
- Landing pages: admin `/admin`, manager `/`, seller `/buyurtmalarim`.
- RPC errors are raised as bare codes and mapped in `uz.errors`.
- Every new SQL function: `security definer set search_path = ''`, `revoke all … from public, anon`, explicit `grant execute … to authenticated` only for client-callable ones.
- Sellers never receive `cost_price`, `unit_cost`, `cost_total` or profit from any table or RPC.
- `pending` orders hold no stock and count in no revenue, stats, least-sold or client totals.
- Supabase project `zeekxqinioeyrjyhuajw`; the live DB has real orders #1–#2: migrations must not delete data. SQL tests consume order numbers; after running them, reset `order_no_seq` to `max(order_no)+1`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A seller submits, then a product is archived or its price changes before approval → approval keeps the seller's price snapshot; an archived product fails with `PRODUCT_NOT_FOUND` and the order stays `pending` (Task 2 test).
- A manager double-clicks Tasdiqlash or two managers approve at once → stock is deducted exactly once; the second call raises `INVALID_STATUS_TRANSITION` (Task 2 test).
- A seller's network drops on submit and they press submit again → one order, not two (`request_id` idempotency, Task 2 test).
- A seller types another seller's order id into `/buyurtmalarim/<id>` → `my_order` returns nothing → "not found" page (Task 2 test + Task 5).
- A disabled seller with a still-valid session → every seller RPC raises `NOT_AUTHORIZED` (Task 1 test).

---

### Task 1: Roles in the database

**Files:**
- Create: `supabase/migrations/20261024000011_roles_enum.sql`, `supabase/migrations/20261024000012_roles.sql`, `supabase/tests/08_roles.sql`
- Modify: `supabase/tests/_helpers.sql` (nothing structural), `supabase/tests/01_rls.sql` … `07_customers.sql` (role names)

**Interfaces:**
- Produces: enum values `app_role = admin | manager | seller`, `order_status` adds `pending`; columns `orders.approved_at timestamptz`, `orders.approved_by uuid references profiles(id)` (FK name `orders_approved_by_fkey`); `require_pos_role()` = active manager, else `NOT_AUTHORIZED`; new `require_staff()` returns uid for active manager or seller, else `NOT_AUTHORIZED`; `analytics_scope(p_seller)` uses `manager`.

- [ ] **Step 1: Write `08_roles.sql`** — one `do $$` block, fixtures logged out:
  - `make_user('manager')` → `profiles.role = 'manager'` and `is_active`.
  - Promoting via `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"manager"}'` on a seller sets `profiles.role = 'manager'`.
  - As seller: `expect_error` `'permission denied'` is NOT the mechanism (grants stay); assert row counts are 0 for `select count(*) from public.products / customers / orders / order_items / stock_movements` and `inventory_summary.cost_value = 0` (RLS hides rows), and `expect_error(..., 'NOT_AUTHORIZED')` for `create_order`, `restock_product`, `adjust_stock`, `change_stock`, `set_order_status`, `cancel_order`, `rename_customer`.
  - As manager: products visible; `create_order` works.
  - As a disabled seller (`make_user('seller', false)`): `require_staff()` path raises `NOT_AUTHORIZED` (call `analytics_report(now()-interval '1 day', now())`).
- [ ] **Step 2: Run** `node scripts/run-db-tests.mjs 08` (or MCP) — Expected: FAIL (`invalid input value for enum app_role: "manager"`).
- [ ] **Step 3: Migration 011** (enum only; it must commit before 012 uses the new values):
  `alter type public.app_role rename value 'owner' to 'manager';` · `alter type public.order_status add value 'pending' before 'new';` · add `approved_at`, `approved_by` to `orders`.
- [ ] **Step 4: Migration 012**:
  - Re-create (`create or replace`) every plpgsql body that names `'owner'`: `require_pos_role` (manager only), `analytics_scope`, `handle_new_user`, `handle_user_role_change` (role list `('admin','manager','seller')`).
  - Add `require_staff()`; revoke from public/anon/authenticated.
  - Drop and re-create policies `products_select/insert/update`, `customers_select`, `orders_select`, `order_items_select`, `stock_movements_select` with `(select public.app_role()) = 'manager'`; storage `product_photos_select` for `in ('manager','seller')`, insert/update/delete `= 'manager'`.
  - Data: set `raw_app_meta_data.role = 'manager'` for users whose profile username is `zayn` or `abdulaziz` (trigger updates profiles).
- [ ] **Step 5: Update tests 01–07**: `make_user('owner')` → `make_user('manager')`; every user that calls `create_order`/stock RPCs becomes `manager`. Delete the seller-scope assertions from 05 and 07 ("seller asking for another seller gets own numbers" and similar); Task 2 Step 4 re-adds them using the seller flow.
- [ ] **Step 6: Apply 011 then 012** to the live project (MCP `apply_migration`), run all SQL tests — Expected: PASS 01–08. Reset `order_no_seq`.
- [ ] **Step 7: Commit** `feat(db): manager role, manager-only store data`

### Task 2: Seller orders in the database

**Files:**
- Create: `supabase/migrations/20261024000013_seller_orders.sql`, `supabase/tests/09_seller_orders.sql`
- Modify: `supabase/tests/05_analytics.sql`, `supabase/tests/07_customers.sql` (seller-scope blocks use the seller flow)

**Interfaces:**
- Consumes: Task 1 enums, `require_staff()`, `require_pos_role()`.
- Produces (all `grant execute to authenticated`):
  - `submit_seller_order(p_request_id uuid, p_items jsonb, p_customer_phone text, p_customer_name text, p_payment_method payment_method, p_destination destination) returns orders` — seller only (`NOT_AUTHORIZED` otherwise); `type='tekpe'`, `status='pending'`.
  - `approve_order(p_order_id uuid) returns orders` — manager only.
  - `seller_catalog(p_query text default null, p_limit int default 60) returns table(id uuid, barcode text, name text, photo_path text, retail_price int, wholesale_price int, weight_g int, stock int)` — staff; active products, `name ilike` match, ordered by name, limit clamped 1–200.
  - `my_orders(p_limit int default 50, p_offset int default 0) returns jsonb` — seller's own orders, newest first: array of `{id, order_no, created_at, status, type, destination, payment_method, item_count, total_weight_g, subtotal, shipping_krw, shipping_usd, shipping_kg, customer:{name,phone}}`.
  - `my_order(p_id uuid default null, p_request_id uuid default null) returns jsonb` — same fields plus `items:[{id, barcode, name, photo_path, unit_price, is_wholesale, qty, line_total, unit_weight_g, line_weight_g}]`, `approved_at`; `null` when not the caller's.
  - `cancel_order` on a `pending` order: no stock change, no movements.
  - `analytics_report`: excludes `pending`; for sellers `cost`, `profit` are JSON `null` and product rows omit `cost`. `least_sold`, `customer_stats`: exclude `pending`.

- [ ] **Step 1: Write `09_seller_orders.sql`** — product P stock 10, seller S, manager M:
  - S `submit_seller_order(r1, 2×P, '+821012345678', 'Ali', 'card', 'UZ')` → `status='pending'`, `type='tekpe'`, P stock still 10, 0 `stock_movements` for the order, `shipping_usd > 0`, one `notification_log` row of kind `tekpe_order` containing `Tasdiqlash kerak`.
  - Same call again with `r1` → same order id (count of orders with r1 = 1).
  - Missing name → `TEKPE_NEEDS_CUSTOMER`; null destination → `TEKPE_NEEDS_DESTINATION`; M calling it → `NOT_AUTHORIZED`.
  - S `approve_order` → `NOT_AUTHORIZED`. M `approve_order` → `status='new'`, `approved_by=M`, P stock 8, one `sale` movement of −2; second `approve_order` → `INVALID_STATUS_TRANSITION`.
  - Price snapshot: submit r2, then (logged out) raise P's retail price; approve r2 → `subtotal` unchanged. Submit r3, archive P, approve r3 → `PRODUCT_NOT_FOUND`, r3 still `pending`.
  - Reject: submit r4, M `cancel_order(r4)` → `cancelled`, stock unchanged.
  - Analytics: with one approved and one pending order, `analytics_report` (as M) `orders` counts only the approved; as S `cost` and `profit` are `null` and `products->0 ? 'cost'` is false; `customer_stats` totals exclude pending.
  - Seller reads: S `seller_catalog('product')` returns P without a `cost_price` key (check `to_jsonb(row) ? 'cost_price'` is false); S `my_orders()` length = S's order count and no element has `cost_total`; second seller S2 `my_order(r1 id)` → `null`.
- [ ] **Step 2: Run** — Expected: FAIL (`function submit_seller_order does not exist`).
- [ ] **Step 3: Migration 013** — `submit_seller_order` shares `create_order`'s validation and snapshot code; extract the line insert + totals into an internal `public.place_order_lines(p_order_id uuid, p_items jsonb, p_deduct boolean, p_uid uuid)` (not granted) used by both, so `create_order` deducts and the seller path doesn't. `approve_order` locks the order `for update`, requires `pending`, locks products `order by id`, raises `PRODUCT_NOT_FOUND` if any is archived, deducts stock and logs `sale` movements, sets `status='new', approved_at, approved_by`. Telegram: `tekpe_alert_text` gains a third line `⏳ Tasdiqlash kerak · <seller full_name>` when `o.status = 'pending'`.
- [ ] **Step 4: Rewrite seller-scope blocks of 05/07** to create seller orders with `submit_seller_order` + `approve_order`; keep the original assertions' numbers.
- [ ] **Step 5: Apply, run all SQL tests** — Expected: PASS 01–09. Reset `order_no_seq`.
- [ ] **Step 6: Commit** `feat(db): seller orders with manager approval`

### Task 3: Roles in the app

**Files:**
- Create: `src/lib/auth/home.ts`, `src/lib/auth/home.test.ts`
- Modify: `src/lib/database.types.ts`, `src/lib/domain/types.ts`, `src/lib/i18n/uz.ts`, `src/lib/auth/session.ts`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/(pos)/layout.tsx`, `src/app/(pos)/page.tsx` and every `(pos)` page, `src/app/print/[id]/page.tsx`, `src/components/shell/nav-items.ts`, `src/components/shell/app-shell.tsx`, `src/components/status-badge.tsx`, `src/features/admin/account-dialog.tsx`, `src/features/admin/actions.ts`, `src/lib/data/orders.ts` (`listSellers` roles), analytics/customers screens (`isOwner` → `isManager`)

**Interfaces:**
- Produces: `type Role = "admin" | "manager" | "seller"` exported from `src/lib/auth/home.ts`; `homeFor(role: Role): "/admin" | "/" | "/buyurtmalarim"`; `navKeyFor(role): NavKey` where `NavKey = "pos" | "seller" | "admin"`; `requireRole` redirects a wrong role to `homeFor(role)`; `NAV.seller = [Sotuv /sotuv (ShoppingBag), Buyurtmalarim /buyurtmalarim (ReceiptText), Statistika /statistika (ChartColumn)]`; `NavItem.badge?: ("lowStock" | "pending")[]` (summed).

- [ ] **Step 1: Write `home.test.ts`** — `homeFor("admin")==="/admin"`, `homeFor("manager")==="/"`, `homeFor("seller")==="/buyurtmalarim"`; `navKeyFor` maps manager→`pos`, seller→`seller`, admin→`admin`.
- [ ] **Step 2: Run** `npx vitest run src/lib/auth/home.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `home.ts`**, then switch types/labels: DB types (enum, `approved_at/approved_by`, the Task 2 RPCs), `OrderStatus` adds `"pending"`, `uz.roles`, `uz.status.pending`, `StatusBadge` style `pending: "border-warn/40 bg-warn-soft text-warn"`, new error codes (none new beyond Task 2's reuse).
- [ ] **Step 4: Guards** — `(pos)/layout.tsx` allows `["manager","seller"]` and passes `navKeyFor(role)`; Kassa, Ombor, Buyurtmalar(+[id]), Tekpe, Mijozlar(+[id]), Bildirishnomalar pages call `requireRole(["manager"])`; Statistika allows both; print `["manager"]`; login page and form redirect via `homeFor`.
- [ ] **Step 5: Admin** — role options Menejer / Sotuvchi (default Sotuvchi); `Role` type from `home.ts`.
- [ ] **Step 6: Verify** `npx tsc --noEmit`, `npx vitest run`, `npx eslint src` — Expected: clean.
- [ ] **Step 7: Commit** `feat: manager and seller roles in the app`

### Task 4: Sotuv (seller catalog, cart, submit)

**Files:**
- Create: `src/lib/data/seller.ts`, `src/features/seller/sell-screen.tsx`, `src/features/seller/catalog-grid.tsx`, `src/app/(pos)/sotuv/page.tsx`
- Modify: `src/features/checkout/use-cart.ts` (storage keys as a parameter), `src/features/checkout/checkout-screen.tsx` (pass Kassa keys), `src/lib/i18n/uz.ts` (`seller` section)

**Interfaces:**
- Consumes: Task 2 RPCs; `cartReducer`/`CartProduct` (`src/lib/domain/cart.ts`); `CartRow`, `TekpeDialog`, `CustomerState` (`src/features/checkout/*`); `resolveRequest`, `cartFingerprint` (`request-key.ts`); `getShippingRates`.
- Produces: `useCart(keys: { cart: string; request: string })`; Kassa uses `{cart:"unity.cart", request:"unity.cart.request"}`, Sotuv `{cart:"unity.seller.cart", request:"unity.seller.request"}`. `src/lib/data/seller.ts`: `sellerCatalog(sb, query: string): Promise<CartProduct[]>`, `submitSellerOrder(sb, args): Promise<{ id: string; order_no: number }>`, `listMyOrders(sb, limit, offset): Promise<MyOrder[]>`, `getMyOrder(sb, { id?: string; requestId?: string }): Promise<MyOrderWithItems | null>` with `MyOrder`/`MyOrderWithItems` mirroring Task 2's JSON.

- [ ] **Step 1:** Parametrise `useCart`; run `npx vitest run` and the Kassa smoke e2e is unaffected (keys unchanged).
- [ ] **Step 2: Build Sotuv** — search box (debounced 250 ms, `sellerCatalog`), grid of product cards (photo, name, retail price, stock; out-of-stock shown but still addable, matching Kassa's warn-at-zero rule), cart list with `CartRow`, sticky total bar on phones, "Buyurtma berish" opens `TekpeDialog`; on confirm → `resolveRequest` with lookup `getMyOrder({requestId})` → `submitSellerOrder` → `finishOrder()` → `router.push("/buyurtmalarim")` + toast "Tasdiqlash uchun yuborildi". Network error keeps the cart and shows the Kassa retry strip.
- [ ] **Step 3: Verify** tsc, vitest, eslint clean; commit `feat: seller sales screen`

### Task 5: Buyurtmalarim (seller orders)

**Files:**
- Create: `src/features/seller/my-orders-screen.tsx`, `src/features/seller/my-order-detail.tsx`, `src/app/(pos)/buyurtmalarim/page.tsx`, `src/app/(pos)/buyurtmalarim/[id]/page.tsx`

**Interfaces:**
- Consumes: `listMyOrders`, `getMyOrder`, `StatusBadge`, `formatOrderTotal`.

- [ ] **Step 1:** List (order no, date, client, status badge, total; status filter chips All / Tasdiq kutilmoqda / Yangi / Tayyor / Olib ketildi / Bekor qilingan, client-side) with "Load more" by 50. Refresh on window focus and every 30 s (sellers have no Realtime access to `orders`).
- [ ] **Step 2:** Detail page: `requireRole(["seller"])`, invalid UUID or `null` from `getMyOrder` → `notFound()`; shows client, destination, payment, items with price/qty/line total/weight, totals, status timeline (created, approved, ready, picked up / cancelled).
- [ ] **Step 3:** Verify and commit `feat: seller orders pages`

### Task 6: Seller Statistika

**Files:**
- Modify: `src/lib/data/analytics.ts` (`cost`/`profit` typed `number | null`), `src/features/analytics/kpi-strip.tsx`, `src/features/analytics/product-table.tsx`, `src/features/analytics/analytics-screen.tsx`

- [ ] **Step 1:** When `report.cost === null`, KpiStrip shows only Savdo daromadi (full width) and ProductTable drops cost/profit columns and the "Foyda" sort. No other change.
- [ ] **Step 2:** Verify and commit `feat: seller statistics without cost`

### Task 7: Manager approval

**Files:**
- Create: `src/features/notifications/use-pending-count.ts`
- Modify: `src/components/shell/app-shell.tsx`, `src/components/shell/nav-items.ts`, `src/features/tekpe/tekpe-screen.tsx`, `src/features/orders/order-detail.tsx`, `src/features/orders/orders-screen.tsx`, `src/features/notifications/notifications-screen.tsx`, `src/lib/i18n/uz.ts`

**Interfaces:**
- Produces: `usePendingCount(enabled: boolean): number | null` — same shape as `useLowStockCount`, counting `orders` with `status='pending'`, Realtime on `orders`. Nav: Tekpe `badge: ["pending"]`, Bildirishnomalar `badge: ["lowStock", "pending"]`.

- [ ] **Step 1:** Tekpe board gets a first tab "Tasdiq kutilmoqda" (count from `countStatus("pending")`); its rows show seller name and two buttons — Tasdiqlash (`approve_order`, toast "Tasdiqlandi") and Rad etish (AlertDialog confirm → `cancel_order`). Errors via `errorMessage`. Board reloads on Realtime `orders` changes.
- [ ] **Step 2:** Order detail: `pending` → Tasdiqlash and Rad etish instead of Bekor qilish; Print hidden until approved. Buyurtmalar status filter includes `pending`.
- [ ] **Step 3:** Bildirishnomalar: "Tasdiq kutilmoqda" list (order no, seller, client, total, link) above low stock.
- [ ] **Step 4:** Verify and commit `feat: managers approve seller orders`

### Task 8: Ship check

- [ ] **Step 1:** Run all SQL tests (01–09), `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npx next build` — Expected: all pass.
- [ ] **Step 2:** Reset `order_no_seq` to `max(order_no)+1`; confirm zayn and abdulaziz are `manager` and orders #1–#2 still exist.
- [ ] **Step 3:** Update `PRODUCT.md` (roles line) and `README.md` (roles section); commit `docs: roles`.
