# Seller Boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seller orders travel in one box per seller per country, sellers record client city/district, Buyurtmalarim groups by box, managers close/print/hand over boxes, and Ombor stock changes only through Tahrirlash.

**Architecture:** A `boxes` table owned by the database: approval drops an order into the seller's open box for its destination; `close_box` fixes box shipping and marks its orders ready; `box_picked_up` cascades. Seller orders carry zero shipping. UI reads boxes through table RLS (managers) or the existing seller JSON RPCs (sellers).

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, Tailwind 4, Supabase (Postgres, RLS, RPC), Vitest. SQL tests run through the Supabase MCP from a temporary `dev_test_files` table (uploaded with the service key), as in the roles plan.

**Spec:** `docs/superpowers/specs/2026-10-25-seller-boxes-design.md`

## Global Constraints

- Uzbek (Latin) copy with ʻ/ʼ, in `src/lib/i18n/uz.ts`. Box number shown `#Q0001` (4 digits, zero-padded).
- Errors as bare codes mapped in `uz.errors`: new `TEKPE_NEEDS_ADDRESS`, `BOX_CLOSED`, `BOX_EMPTY`, `BOX_NOT_FOUND`.
- Sellers never receive cost; box RPCs and JSON follow the same rule.
- Kassa (manager) orders unchanged, including per-order shipping and A4 printing.
- New SQL functions: `security definer set search_path = ''`; client-callable ones granted to `authenticated` only.
- Live DB has real data: migration must not delete rows. It is applied live only together with the deploy.

## Review Focus

- Approving two orders for the same seller at the same moment → both land in one open box (unique partial index + `on conflict` retry), never two open boxes.
- Closing a box while an approval is in flight → the late order goes to a new open box, never into the closed one (box row locked `for update` in both paths).
- Cancelling an approved order in an open box → stock returns and the order leaves the box; in a closed box → `BOX_CLOSED`.
- A seller types only spaces for city/district → `TEKPE_NEEDS_ADDRESS`.
- Two devices edit the same product's stock in Tahrirlash → the second save gets `STOCK_CHANGED`, not a silent overwrite.

---

### Task 1: Boxes in the database

**Files:** Create `supabase/migrations/20261025000014_boxes.sql`, `supabase/tests/10_boxes.sql`; Modify `supabase/tests/05_analytics.sql`, `07_customers.sql`, `09_seller_orders.sql` (new submit arguments, zero order shipping).

**Interfaces — Produces:**
- `boxes(id uuid pk, box_no bigint default nextval('box_no_seq'), seller_id uuid → profiles, destination destination, status box_status ('open','closed','picked_up'), order_count int, item_count int, total_weight_g int, shipping_krw int, shipping_usd numeric(10,2), shipping_kg int, created_at, closed_at, closed_by, picked_up_at, picked_up_by)`; unique index on `(seller_id, destination) where status = 'open'`; RLS select for managers only; realtime publication.
- `orders.box_id uuid → boxes`, `orders.ship_city text`, `orders.ship_district text`.
- `submit_seller_order(p_request_id, p_items, p_customer_phone, p_customer_name, p_city text, p_district text, p_payment_method, p_destination)` (old signature dropped) — trims city/district, raises `TEKPE_NEEDS_ADDRESS` when blank, stores them, order shipping 0.
- `place_order_lines(p_order_id, p_items, p_deduct, p_uid, p_with_shipping boolean default true)`.
- `approve_order` — after deducting stock, `box_id := public.open_box_for(seller, destination)` (locks/creates the open box).
- `close_box(p_box_id uuid) returns boxes` — manager; `BOX_NOT_FOUND`, `BOX_CLOSED` unless open, `BOX_EMPTY` when no orders; sets totals and shipping (KR `kr_shipping_krw`; UZ `greatest(1, ceil(weight/1000))` × `uz_shipping_usd_per_kg`), status `closed`, orders `ready` (`ready_at/by`).
- `box_picked_up(p_box_id uuid) returns boxes` — manager; requires `closed`; box and its orders `picked_up`.
- `cancel_order` — order in a closed/picked-up box → `BOX_CLOSED`; in an open box → stock returned as today and `box_id` cleared.
- `set_order_status` — orders with a `box_id` → `INVALID_STATUS_TRANSITION` (boxes move them).
- `seller_order_json` adds `ship_city`, `ship_district`, `box_id`, `box_no`, `box_status`.
- `analytics_report` shipping totals add box shipping for boxes closed in the range (seller scope = box seller).

- [ ] **Step 1: Write `10_boxes.sql`** — seller S, manager M, product P (600 g, stock 50):
  - S submits KR order with city `'  '` → `TEKPE_NEEDS_ADDRESS`; with `'Seul'`/`'Gangnam'` → stored, `shipping_krw = 0`, `shipping_usd = 0`.
  - M approves two KR orders and one UZ order of S → two boxes total; both KR orders share one `open` box; `box_no` > 0.
  - Seller S2's approved KR order → its own box.
  - Cancel one KR order in the open box → stock restored, `box_id` null.
  - `close_box(kr)` → `status = 'closed'`, `order_count = 1`, `shipping_krw = 4000`; its order `ready`; `close_box` again → `BOX_CLOSED`; closing an empty box → `BOX_EMPTY`.
  - UZ box with 3×600 g → `shipping_kg = 2`, `shipping_usd = 20`.
  - Approving another KR order of S after close → a new open box (different id).
  - `cancel_order` on the order in the closed box → `BOX_CLOSED`; `set_order_status` on it → `INVALID_STATUS_TRANSITION`.
  - `box_picked_up(kr)` → box and order `picked_up`; on an open box → `BOX_CLOSED`... (requires closed: raise `INVALID_STATUS_TRANSITION`).
  - S calling `close_box` / `box_picked_up` → `NOT_AUTHORIZED`; S reading `boxes` → 0 rows; `my_order` shows `box_no`, `ship_city`.
  - Manager `analytics_report(seller S)` `shipping_krw` includes the closed box's 4000.
- [ ] **Step 2: Run** with prelude = none → FAIL (`submit_seller_order` argument mismatch / `boxes` missing).
- [ ] **Step 3: Write migration 014** to the interfaces above.
- [ ] **Step 4: Update tests 05/07/09** for the new submit arguments and zero per-order shipping on seller orders (09: `shipping_usd = 20` assertion becomes `0`; KR approval check `shipping_krw = 4000` becomes `0`).
- [ ] **Step 5: Run all SQL tests with prelude 014** → 10/10 PASS. Commit `feat(db): seller boxes`.

### Task 2: Seller form and data layer

**Files:** Modify `src/lib/database.types.ts`, `src/lib/data/seller.ts`, `src/features/checkout/tekpe-dialog.tsx`, `src/features/checkout/customer-panel.tsx` (`CustomerState` gains `city`, `district`), `src/features/seller/sell-screen.tsx`, `src/lib/i18n/uz.ts`.

- [ ] `TekpeDialog` gets `showAddress` (seller only): *Shahar / viloyat* and *Tuman* inputs, required alongside name and phone; `missing` includes them.
- [ ] `submitSellerOrder` sends `p_city`, `p_district`; `MyOrder` gains `ship_city`, `ship_district`, `box_id`, `box_no`, `box_status`.
- [ ] Verify tsc/eslint/vitest; commit `feat: sellers record client city and district`.

### Task 3: Buyurtmalarim grouped by box

**Files:** Create `src/lib/domain/box-groups.ts` + test; Modify `src/features/seller/my-orders-screen.tsx`, `src/features/seller/my-order-detail.tsx`.

**Interfaces:** `groupByBox(orders: MyOrder[], destination: "KR" | "UZ"): { key: string; kind: "pending" | "open" | "closed" | "other"; boxNo: number | null; orders: MyOrder[] }[]` — filters by destination; order: pending (status `pending`), open box, closed/picked-up boxes by `box_no` desc, then anything else (cancelled, no box).

- [ ] **Test** `box-groups.test.ts`: destination filter; group order pending → open → closed (newest box first) → other; orders keep newest-first inside a group.
- [ ] Run → FAIL; implement; run → PASS.
- [ ] Screen: Koreya / Oʻzbekiston switch (with counts), group headers ("Tasdiq kutilmoqda", "Ochiq quti #Q0007", "#Q0005 · Yopilgan", "Bekor qilingan"), rows: name · soni · shahar, tuman · telefon · holat; table on ≥ md, stacked rows on phones. Detail shows box number and address.
- [ ] Commit `feat: seller orders grouped by box`.

### Task 4: Tekpe Qutilar and box list print

**Files:** Create `src/lib/data/boxes.ts`, `src/features/tekpe/boxes-tab.tsx`, `src/app/print/box/[id]/page.tsx`, `src/features/print/box-sheet.tsx`; Modify `src/features/tekpe/tekpe-screen.tsx` (Qutilar tab; per-order tabs and counts filter `box_id is null`), `src/lib/data/orders.ts` (`OrderFilters.noBox`), `src/features/orders/order-detail.tsx` + `orders-screen.tsx` (box number, city/district; print hidden when `box_id`), `src/lib/domain/order-no.ts` (`formatBoxNo`).

- [ ] `formatBoxNo(12) === "#Q0012"` unit test → FAIL → implement → PASS.
- [ ] Qutilar tab: status chips Ochiq / Yopilgan / Olib ketildi; each box row: box no, seller, country, orders, items, weight (live sum for open boxes), shipping (closed); actions: open → *Yopish va chop etish* (confirm dialog, then `close_box`, then `printBox(id)`); closed → *Chop etish*, *Olib ketildi*. Realtime refresh on `boxes` and `orders`.
- [ ] Box sheet A4 (reuses print.css and the desktop silent print path via `/print/box/<id>`): header (#Q, seller, country, date), rows per client with items beneath, footer totals. Manager only.
- [ ] Commit `feat: managers close and print seller boxes`.

### Task 5: Ombor stock only through Tahrirlash

**Files:** Create `src/features/inventory/stock-field.tsx`; Modify `src/features/inventory/inventory-screen.tsx` (list shows read-only stock + `StockBar`), `src/features/inventory/product-form.tsx` (edit mode: stock field; on save, `adjust_stock(id, new, original)` only when changed), `src/lib/domain/stock.ts` + test.

**Interfaces:** `stockToSave(original: number, draft: string): number | null` — `null` when unchanged or blank; otherwise the integer ≥ 0 (clamped).

- [ ] Test → FAIL → implement → PASS.
- [ ] `StockField`: −10 / +10 buttons and a numeric input; local state only.
- [ ] On `STOCK_CHANGED`, show the error and reload the product's current stock into the field.
- [ ] Remove `StockStepper` from the list (delete the component if unused). Commit `feat: stock changes only through Tahrirlash`.

### Task 6: Ship check

- [ ] tsc, eslint, vitest, `next build`; all SQL tests with prelude 014.
- [ ] Review the whole diff (code-review, high); fix Critical/Important with tests.
- [ ] Hand off: user pushes; then apply 014 live, run SQL tests live, drop `dev_test_files`.
