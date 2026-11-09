# Unity Beauty POS — Design Spec

Date: 2026-10-23
Status: Draft, awaiting review

## 1. Goal

A web-based point-of-sale and order management system for **Unity Beauty**, a cosmetics seller based in Korea that sells in store and ships to customers in Korea and Uzbekistan (via 택배 / "tekpe").

The owner and up to ~9 sellers use it on a Windows desktop (with USB barcode scanner and A4 printer) and on phones. All devices share one online database.

Success means:
- A sale can be rung up in seconds by scanning barcodes (or searching), with the customer recorded by phone number.
- Stock is always correct across devices, and low stock is flagged.
- Every order can produce a printed A4 order sheet with a private QR code that staff scan to move shipping orders forward.
- The owner can see what was sold, earned, and profited — overall and per seller.

## 2. Platform & language

- UI language: **Uzbek (Latin)** only. All strings live in one dictionary file (`src/lib/i18n/uz.ts`) so other languages can be added later.
- Currency: **KRW** for all product prices and totals. Shipping to Uzbekistan is in **USD**.
- Money format: `85 000 ₩`, `30 $`. Weight: grams per item, kilograms for totals (`1,25 kg`).
- Timezone for "today / this week / …": **Asia/Seoul**. Weeks start on Monday.
- Online only. No offline mode.

## 3. Users & roles

| Role | Who | Can do |
|---|---|---|
| `admin` | The developer | Create/disable accounts, set usernames and passwords, edit app settings (shipping rates, Telegram). Does not use the POS screens. |
| `owner` | Main salesman | Everything a seller can, plus **overall analytics** and analytics per seller. |
| `seller` | Staff (up to ~9) | Checkout, inventory (incl. cost price, add/edit products, stock), orders, cancel orders, Tekpe, notifications, **own analytics only**. |

- Login is **username + password**. Supabase Auth needs an email, so each account uses a synthetic email `<username>@unitybeauty.local`; users never see it.
- No self sign-up. Only admin creates accounts.
- Disabled accounts cannot log in; their past orders stay attributed to them.

## 4. Architecture

```
 Windows desktop                     Phones
 ┌─────────────────────────┐         ┌──────────────────┐
 │ Electron .exe           │         │ Mobile browser   │
 │  └ loads the web app    │         │ (installable PWA)│
 │  └ silent print bridge  │         │ camera scanner   │
 │ USB barcode scanner     │         └────────┬─────────┘
 └────────────┬────────────┘                  │
              │            HTTPS              │
              └──────────► Next.js on Vercel ◄┘
                           │  (UI, server routes for admin)
                           ▼
                        Supabase
                        ├ Postgres (tables, RLS, RPC functions)
                        ├ Auth (username/password)
                        ├ Storage (product photos)
                        ├ Realtime (live stock / order updates)
                        └ pg_net (Telegram messages)
```

**Stack**
- Next.js (App Router) + TypeScript + Tailwind CSS.
- `@supabase/ssr` for auth in server and client components.
- Business-critical writes (checkout, cancel, restock, status changes) are **Postgres functions (RPC)** so they are atomic and run the same no matter which device calls them.
- Barcode/QR camera scanning: `barcode-detector` (uses the native `BarcodeDetector` API where present, ZXing-WASM fallback on iOS Safari). Live video, continuous scanning, no photo taken.
- Phone numbers: `libphonenumber-js`, stored as E.164 (`+821012345678`).
- QR generation: `qrcode`.
- Desktop: **Electron**, packaged with `electron-builder` into a Windows installer `.exe`.
- Source on GitHub; the user pushes and Vercel deploys from GitHub.
- Supabase: project ref `zeekxqinioeyrjyhuajw`, region `ap-northeast-2` (Seoul).

## 5. Data model

All money is integer KRW unless the column name says `usd`. All weights are integer grams.

**profiles** — one per auth user
- `id uuid pk` (= `auth.users.id`), `username text unique`, `full_name text`, `role` (`admin|owner|seller`), `is_active bool`, `created_at`

**products**
- `id uuid pk`, `barcode text unique not null`, `name text not null`, `photo_path text null` (Storage path)
- `cost_price int` (Price1), `retail_price int` (Price2), `wholesale_price int` (Price3)
- `weight_g int`, `stock int default 0`, `low_stock_threshold int default 10`
- `is_archived bool default false`, `created_at`, `updated_at`

**stock_movements** — every stock change, for restock history and audit
- `id`, `product_id`, `kind` (`restock|sale|cancel|adjust`), `qty_change int` (+/−), `cost_price int null` (for restocks), `order_id null`, `user_id`, `created_at`

**customers**
- `id`, `phone text unique` (E.164), `name text`, `created_at`

**orders**
- `id uuid pk`, `order_no bigint unique` (from a sequence; shown as `#000123`)
- `request_id uuid unique` — idempotency key from the client
- `qr_token text unique` — 10-char random base32, the only thing in the QR
- `customer_id null`, `seller_id` (profile who rang it up)
- `type` (`store|tekpe`), `destination` (`KR|UZ`, null for store)
- `payment_method` (`cash|card|transfer`)
- `status` (`completed|new|ready|picked_up|cancelled`)
- `item_count int` (sum of quantities), `line_count int`, `total_weight_g int`
- `subtotal int` (products, ₩), `cost_total int` (snapshot, for profit)
- `shipping_krw int default 0`, `shipping_usd numeric(10,2) default 0`, `shipping_kg int default 0`
- `ready_at/ready_by`, `picked_up_at/picked_up_by`, `cancelled_at/cancelled_by`, `created_at`

**order_items** — snapshots so later product edits never change past orders
- `id`, `order_id`, `product_id`, `barcode`, `name`, `photo_path`
- `unit_price int`, `is_wholesale bool`, `unit_cost int`, `unit_weight_g int`, `qty int`
- `line_total int` (= unit_price × qty), `line_weight_g int` (= unit_weight_g × qty)

**app_settings** — single row, editable by admin
- `kr_shipping_krw int default 4000` (flat per order)
- `uz_shipping_usd_per_kg numeric default 10`


**app_secrets** — single row, admin-only (Phase 2)
- `telegram_bot_token text null`, `telegram_chat_id text null` (readable only by admin and by security-definer functions)

### Key database functions (RPC, `security definer`, role-checked)

- `create_order(request_id, items[], customer_phone, customer_name, payment_method, type, destination)`
  - `request_id` is a client-generated UUID stored in `orders.request_id` (unique); calling again with the same id returns the existing order instead of creating a new one.
  - Locks the product rows, snapshots price/cost/weight, decrements stock (stock may go negative — the UI already warned), writes `sale` stock movements.
  - Finds the customer by phone or creates it; updates the name if a new one is given.
  - Computes weight, subtotal, cost, shipping (see §7), status (`completed` for store, `new` for tekpe), order number and QR token.
  - Returns the full order.
- `cancel_order(order_id)` — any non-cancelled order; restores stock with `cancel` movements; sets `cancelled`.
- `restock_product(product_id, qty, cost_price?)` — adds stock, writes `restock` movement, optionally updates cost price.
- `adjust_stock(product_id, new_stock)` — used by the inventory −10/+10 stepper and direct edit; writes an `adjust` movement for the difference.
- `set_order_status(qr_token_or_id, status)` — `new → ready → picked_up` only, records who and when.
- Analytics functions (see §8) aggregate in SQL so phones don't download every order.

### Security (RLS)
- Every table has RLS on. Only authenticated, active users can read or write.
- Sellers and owner can read all products, orders, customers (shared business data).
- Writes to `orders`, `order_items`, `stock_movements` go only through the RPC functions (no direct insert/update grants).
- Analytics functions return overall/other-seller data only when the caller is `owner`.
- `admin` can manage `profiles` and `app_settings`; account creation/password reset run in a Next.js server route using the Supabase service-role key, after verifying the caller is admin.

## 6. Screens

Navigation (desktop: left sidebar; phone: bottom bar with "More"):
**Kassa** (checkout, home) · **Ombor** (inventory) · **Buyurtmalar** (orders) · **Tekpe** · **Statistika** · **Bildirishnomalar** (with badge) · **Admin** (admin only).

### 6.1 Kassa — checkout (home)

Desktop layout: left = cart, right = customer & payment panel.

**Left – cart**
- Scanning works anywhere on the page: a page-wide listener recognises the USB scanner's fast keystroke burst + Enter, even if the cursor is in the phone or name field (the field is left unchanged). The product is added (or its qty +1 if already in the cart). Unknown barcode → toast "Mahsulot topilmadi" with a shortcut to add it in Ombor.
- Search bar with live suggestions by name or barcode, for when scanning isn't possible. Typing a full barcode and Enter adds it too.
- Cart rows: photo, name, unit price, **"Optom" toggle** (switches the row to wholesale price), qty with −/+ and tap-to-type, line total, remove.
- If qty exceeds stock: the row shows a warning ("Omborda 3 ta qoldi"), but the sale is allowed.

**Right – customer & payment**
- Phone input with country selector, **🇰🇷 +82 default**, 🇺🇿 +998 option.
- When the phone matches an existing customer: their name fills in and a note shows "Doimiy mijoz · 5 ta buyurtma".
- Name input.
- Payment method: Naqd (cash) / Karta (card) / O'tkazma (transfer).
- Totals: item count, total weight, subtotal.
- Buttons: **Checkout** (primary, large) and **Tekpe** (secondary).
  - Checkout → store order, status `completed`. Phone and name are optional for store sales.
  - Tekpe → dialog to pick destination **Koreya** or **O'zbekiston**, shows the shipping cost and final total, phone and name **required** → order with status `new`.
- After either: success dialog with order number, **Chop etish** (print) button (optional), and **Yangi buyurtma** (new order) which clears the screen.

**Phone layout**: cart list full width; a **camera button** opens a live scanner that keeps adding items (beep + vibrate on each scan, same code ignored for 1.5 s); customer/payment opens as a bottom sheet with the two buttons.

### 6.2 Ombor — inventory

- Top summary cards:
  - **Tannarx qiymati** — Σ cost × stock (money spent on current stock)
  - **Kutilayotgan daromad (chakana)** — Σ retail × stock
  - **Kutilayotgan daromad (optom)** — Σ wholesale × stock
- **Mahsulot qo'shish** button → scan (USB or camera) or type a barcode:
  - **Known barcode** → dialog with product name/photo and a quantity input (−10/+10 steppers, editable) and optional new cost price → `restock_product`.
  - **Unknown barcode** → full product form: name, photo (optional; upload or phone camera), cost price, retail price, wholesale price, weight (g), starting quantity, low-stock threshold (default 10).
- Product table: photo, name, barcode, 3 prices, weight, stock.
  - Stock cell: **−10 / +10** buttons, and tapping the number makes it editable → `adjust_stock`.
  - Low stock rows highlighted.
- Search and sort. Row actions: edit, archive (archived products hide from checkout and the list, but old orders keep them).
- Live updates: stock changes from other devices appear without refresh (Supabase Realtime).

### 6.3 Buyurtmalar — orders

- List: order number, date/time, customer name + phone, seller, type (Do'kon / Tekpe + destination), payment method, status, total.
- Filters: status, type, date range, seller; search by order number or phone.
- Order detail: everything on the printed sheet, plus seller and status history; buttons **Chop etish** (print) and **Bekor qilish** (cancel, with confirmation; restores stock). Orders cannot be edited.

### 6.4 Tekpe

- Three tabs: **Yangi** (new) · **Tayyor** (ready) · **Olib ketildi** (picked up), each with counts.
- **Tayyor buyurtmalar** button → scanner mode (USB scanner on desktop, camera on phone) → scanning the QR on the printed sheet shows the order summary → **Tasdiqlash** (confirm) → `ready`. Scanning continues for the next sheet.
- In **Tayyor**: select one or many orders → **Tekpe olib ketdi** → `picked_up`. A second scan of the QR also moves a `ready` order to `picked_up`.
- Each order also has a manual "Tayyor" button in the list, for when a sheet is lost.

### 6.5 Statistika — analytics

- Period switch: **Kun / Hafta / Oy / Yil** with ◀ ▶ to move between periods (e.g. previous day).
- Owner only: scope switch **Umumiy** (overall) / **Mening** (mine) / a specific seller. Sellers always see only their own.
- Top KPI cards: **Savdo daromadi** (sales income = Σ subtotal), **Tannarx** (cost = Σ cost_total), **Foyda** (profit = income − cost), orders count, items sold, shipping collected (₩ and $ separately), and a breakdown by payment method (cash / card / transfer).
- Below: product table for the period, one row per product: photo, name, unit price (average if mixed retail/wholesale), qty, revenue, unit weight, total weight, cost, profit — with totals row.
- **Eng ko'p sotilganlar** (best sellers): top 10 by quantity in the selected period.
- **Eng kam sotilganlar** (least sold): products in stock with the fewest sales in the **last 14 days** and the **last 30 days** (two lists), including products with zero sales.
- Cancelled orders are excluded from everything.

### 6.6 Bildirishnomalar — notifications

- List of products where `stock ≤ low_stock_threshold` (most urgent first), with a quick "restock" action.
- Badge on the nav item with the count.
- **Telegram** (if configured in Admin): a message to the owner's chat when a product drops to or below its threshold, and when a new Tekpe order is created. Sent from Postgres via `pg_net` so it works no matter which device made the change.

### 6.7 Admin

- Accounts table: username, full name, role, active, created.
- Create account (username, full name, password, role), reset password, change role, disable/enable. Max ~10 accounts is expected; no hard limit.
- Settings: Korea shipping (₩ per order), Uzbekistan shipping ($ per kg), Telegram bot token and chat ID, with a "send test message" button.

## 7. Shipping & totals

- Store order: no shipping. Total = subtotal ₩.
- Tekpe → **Koreya**: shipping = `kr_shipping_krw` (4000 ₩) per order. Total = subtotal + 4000 ₩.
- Tekpe → **O'zbekiston**: `shipping_kg = ceil(total_weight_g / 1000)` (minimum 1), shipping = `shipping_kg × uz_shipping_usd_per_kg` $. Total is shown in two parts: **`85 000 ₩ + 30 $`**. No exchange rate is stored.
- Rates are copied onto the order when it is created, so changing settings later doesn't change old orders.

## 8. Printed order sheet (A4)

Route `/print/[orderId]` (login required), styled for A4 portrait, black-and-white.

- **Header**: Unity logo and Nura logo side by side, order number `#000123`, date/time, customer name and phone, order type and destination.
- **Table**: Rasm (photo) · Mahsulot nomi · Narxi (unit price) · Soni (qty) · Summa (unit × qty) · Og'irligi (unit weight) · Umumiy og'irlik (unit weight × qty). The header row repeats on each page if the order is long.
- **Summary**: total products (lines) and total quantity (e.g. "7 ta mahsulot"), total weight (kg), subtotal, shipping (with kg for Uzbekistan), **total** (two-part for Uzbekistan), payment method.
- **QR code** in a corner. It contains only the random `qr_token` (e.g. `K7Q2M9XD4P`) — **no URL and nothing that reveals the system**. A normal phone camera shows meaningless text; only the app's scanner resolves it.
- The sheet never shows cost price, profit, seller account, or system name. Branding on the sheet is only the two logos.
- Logos: `Unity.png` is used as-is; `Nura.png` is cleaned during the build (near-transparent speckle pixels removed) so it prints crisp on a B/W printer. Product photos are printed small and grayscale.

**Printing**
- In the desktop `.exe`: prints **silently** to the selected printer (no dialog).
- In a normal browser (phone or desktop without the .exe): opens the browser print dialog.
- Printing is always optional — a button after checkout/Tekpe and in every order's detail.

## 9. Desktop app (.exe)

- Electron shell that loads the production Vercel URL — web updates reach the desktop automatically; the .exe rarely needs rebuilding.
- A preload script exposes `window.unityDesktop.print(orderId)`. It renders `/print/[orderId]` in a hidden window and calls `webContents.print({ silent: true, deviceName })`.
- A small settings screen in the .exe to pick the printer (saved locally).
- The web app checks for `window.unityDesktop` to decide silent print vs. browser dialog.
- Built with `electron-builder` into a Windows installer (`UnityBeautyPOS-Setup.exe`) with the Unity logo as the icon.

## 10. Design direction

- Background light gray `#f2f2f0`, primary buttons sand beige `#e8d9c4` with dark text. (Changed 2026-10-23 from `#fcf2f0` / `#f8ad9d`: the client found the pink too girly.)
- Built for speed at the counter: large touch targets, the scan field always ready, the Checkout button the clearest thing on the screen, keyboard shortcuts on desktop (e.g. F2 search, F9 checkout).
- Responsive: desktop two-panel layout; phone single column with bottom navigation.
- Visual design is done during the build with the `/impeccable` and `/web-design-guidelines` skills.

## 11. Error handling

- Checkout RPC is one transaction: either the whole order is saved and stock changed, or nothing is.
- Network failure during checkout: the cart stays on screen and a retry button appears; the RPC uses a client-generated idempotency key so a retry can't create a duplicate order.
- Two devices selling the last item at the same moment: both succeed (stock may go negative), matching the "warn, don't block" rule; the item then shows in notifications.
- Scanning a QR that isn't a known order, or an order in the wrong status: clear message ("Bu buyurtma allaqachon tayyor").
- Lost connection: a banner "Internet yo'q" and checkout buttons disabled until it returns.

## 12. Testing

- Unit tests (Vitest) for pure logic: shipping and totals, weight rounding, phone normalization, money formatting, order number formatting.
- Database tests: SQL scripts run against the Supabase project for `create_order`, `cancel_order`, `restock_product`, `adjust_stock`, `set_order_status`, and RLS (seller can't see overall analytics, can't write orders directly).
- End-to-end smoke test (Playwright) of: login → add product → checkout → print page renders → Tekpe scan by token → analytics shows the sale.
- Manual check on a real phone (camera scanning) and the Windows .exe (silent print).

## 13. Delivery phases

**Phase 1 — selling (first release)**
1. Supabase project, schema, RLS, RPC functions.
2. Login, roles, Admin accounts and settings.
3. Ombor (inventory) with scan-to-add.
4. Kassa (checkout) on desktop and phone, with camera scanning.
5. Buyurtmalar (orders) with cancel.
6. Print sheet with QR (browser print).
7. Tekpe tab with QR scanning.

**Phase 2**
8. Statistika (analytics).
9. Bildirishnomalar + Telegram.
10. Electron .exe with silent printing.

## 14. Out of scope (for now)

Offline mode, languages other than Uzbek, barcode label printing, discounts, debt/partial payment, editing orders, a customer list/promotions screen (customer data is collected so this can be added later), courier tracking numbers.
