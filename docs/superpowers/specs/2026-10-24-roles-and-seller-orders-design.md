# Roles: root, manager, seller — and seller orders with manager approval

Date: 2026-10-24 · Status: approved in chat, awaiting spec review

## Why

Unity Beauty has two kinds of staff. Managers run the store: Kassa, scanning, inventory, packing
Tekpe parcels. Sellers take remote orders for clients and should see only what they need to do
that. The client (root) keeps the accounts/settings console as it is today.

## What the client said

- Three account types: root (the client), manager, seller.
- Root: leave as it is (accounts + settings only).
- Manager: the store account — scanning, checkout and everything else in the store.
- Seller: products list, search by name, cart, submit order, their own order stats.
- A submitted seller order lands in the seller's orders page and notifies managers; the manager
  approves, packs and confirms it for Tekpe.
- Seller orders are Tekpe only. Stock goes down when the manager approves, not at submit.
- Existing accounts zayn and abdulaziz become managers.

## Assumptions (stated, not asked)

- Sellers never see cost price, cost totals or profit — not in the UI, not through the API.
- Managers get today's "owner" powers: overall stats with profit (and per-seller filter), all
  clients, all orders. Root does not see stats.
- Sellers do not see the Mijozlar tab, Ombor, Tekpe board, Bildirishnomalar or Kassa.

## Roles

| Role in DB | UI label | Lands on | Menu |
|---|---|---|---|
| `admin` | Root | `/admin` | Akkauntlar, Sozlamalar (unchanged) |
| `manager` (renamed from `owner`) | Menejer | `/` (Kassa) | Kassa, Ombor, Buyurtmalar, Tekpe, Mijozlar, Statistika, Bildirishnomalar |
| `seller` | Sotuvchi | `/buyurtmalarim` | Sotuv, Buyurtmalarim, Statistika |

- `alter type app_role rename value 'owner' to 'manager'`; every function/trigger that names the
  role is re-created. `require_pos_role()` → split into `require_manager()` (Kassa, inventory,
  Tekpe, approval, rename client) and `require_staff()` (manager or seller).
- Migration sets zayn and abdulaziz to `manager` (auth `app_metadata.role` + profile).
- Admin UI: role choices Menejer / Sotuvchi.

## Orders: `pending` status

- `order_status` gains `pending` (label "Tasdiq kutilmoqda").
- New RPC `submit_seller_order(request_id, items, phone, name, payment, destination)` —
  seller only. Validates like `create_order` (Tekpe needs phone + name + destination), snapshots
  prices/cost/weight and shipping, upserts the customer, assigns the order number, status
  `pending`. **No stock change, no stock_movements.** Idempotent on `request_id`.
  Sends the Telegram Tekpe alert with a "Tasdiqlash kerak" line.
- `create_order` (Kassa) becomes manager only; unchanged otherwise.
- New RPC `approve_order(id)` — manager only, order must be `pending`. Locks the products,
  deducts stock with `sale` movements (low-stock trigger fires as usual), sets status `new`,
  records `approved_at/approved_by`. Products archived since submit → `PRODUCT_NOT_FOUND`.
- Reject = existing `cancel_order(id)`, which for a `pending` order cancels without returning
  stock (none was taken).
- Analytics, `least_sold`, `customer_stats`: count only orders that are not `cancelled` and not
  `pending`.

## Seller data access

Seller loses direct `select` on products, customers, orders, order_items and stock_movements
(RLS policies become manager-only). Everything a seller reads goes through SECURITY DEFINER RPCs:

- `seller_catalog(query, limit)` — active products: id, barcode, name, photo, retail and
  wholesale price, weight, stock. No cost.
- `my_orders(limit, offset)` — the seller's orders with client name/phone, no cost fields.
- `my_order(id)` — one of the seller's orders with items, no cost fields.
- `analytics_report` / `least_sold` keep their seller scope; for sellers `cost` and `profit`
  come back as `null`.
- Product photos stay readable (storage policy for staff).

## Manager side

- Live count of pending orders (realtime on `orders`): badge on Tekpe and Bildirishnomalar.
- Tekpe board: a "Tasdiq kutilmoqda" group on top with Tasdiqlash / Rad etish per order.
- Buyurtmalar: status filter includes "Tasdiq kutilmoqda"; order detail shows Tasdiqlash /
  Rad etish for pending orders. Print is available after approval.
- Bildirishnomalar: pending orders listed above low-stock products.

## Seller screens

- **Sotuv** (`/sotuv`): searchable product grid (photo, name, price, stock) → cart (qty, Optom)
  → Tekpe form (phone KR/UZ, name, destination, payment) → submit. Cart kept in session storage
  like Kassa; request id makes submit safe to retry. On success: go to `/buyurtmalarim` with a
  "Tasdiqlash uchun yuborildi" toast.
- **Buyurtmalarim** (`/buyurtmalarim`, `/buyurtmalarim/[id]`): own orders with status badge,
  total, client; detail with items. Realtime refresh when a manager approves.
- **Statistika**: the existing screen in seller mode, cost and profit cells hidden.

## Mijozlar bug

Not a code fault: both clients exist, but each was entered by a different seller account and
sellers only see their own clients; there was no owner account. Making zayn and abdulaziz
managers fixes it. Clients are created when an order is submitted, not while typing.

## Testing

- SQL: role rename + triggers; `submit_seller_order` (no stock change, pending, idempotent,
  Tekpe validation); `approve_order` (stock deducted once, movements, not twice, manager only);
  reject of pending (no stock returned); sellers denied on tables and on manager RPCs; seller
  RPCs hide cost; pending excluded from analytics and client totals.
- Unit: role → landing page / menu mapping; seller cart helpers where they differ from Kassa.
- Existing SQL and unit suites stay green (update 01–07 for the role rename).

## Out of scope

Editing an order after submit; partial approval; seller commissions; seller access to Mijozlar.
