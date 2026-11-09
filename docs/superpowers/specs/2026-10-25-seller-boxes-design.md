# Seller boxes: one box per seller per country instead of one A4 per order

Date: 2026-10-25 · Status: approved in chat, awaiting spec review

## Why

Sellers take several orders a day from clients in many places. Printing and packing each order
separately is slow and messy. A seller's orders should travel together in one box (one for Korea,
one for Uzbekistan), with one printed list so the seller knows whose package is whose.

## What the client asked for (and only this)

- Seller orders are merged into boxes: per seller, one Korea box and one Uzbekistan box.
- For each sale the seller enters the client's name, phone, city and district.
- The seller's orders list shows name · quantity · address (city/district) · phone, split by
  Korea and Uzbekistan.
- Decisions: the manager closes a box (then a new one starts); shipping is charged per box; the box
  goes to the seller; one A4 list is printed per box.

- Stock quantity in Ombor may only be changed through **Tahrirlash**, so it can't be changed by
  accident on the list.

Nothing else: no autofill, no seller addresses, no QR on the box, no billing, no Telegram changes.

## Data

- New table `boxes`: `id`, `box_no` (sequence, shown `#Q0001`), `seller_id`, `destination` (KR/UZ),
  `status` (`open` → `closed` → `picked_up`), `total_weight_g`, `item_count`, `order_count`,
  `shipping_krw`, `shipping_usd`, `shipping_kg`, `created_at`, `closed_at/closed_by`,
  `picked_up_at/picked_up_by`. At most one open box per seller and destination (unique partial index).
- `orders` gains `box_id` (nullable), `ship_city`, `ship_district` (text).
- Seller orders carry no shipping of their own (`shipping_* = 0`); the box carries it.

## Flow

1. **Submit** (`submit_seller_order`): now also takes city and district; name, phone, city and
   district are required (`TEKPE_NEEDS_ADDRESS` when city or district is blank). Order shipping 0.
2. **Approve** (`approve_order`): as today (stock deducted, status `new`), plus the order joins the
   seller's open box for its destination; a box is created when none is open.
3. **Close** (`close_box(id)`, manager): box must be `open` and non-empty. Sets weight/items/orders
   totals and shipping (KR: `kr_shipping_krw` once; UZ: `ceil(weight kg)` (min 1) × rate), status
   `closed`; its orders become `ready`. Approvals after this go into a new open box.
4. **Picked up** (`box_picked_up(id)`, manager): box `closed` → `picked_up`; its orders `picked_up`.
5. Cancelling an order that sits in an open box removes it from the box (`box_id` cleared); orders in
   a closed box cannot be cancelled (`BOX_CLOSED`).

## Screens

- **Sotuv (seller):** Tekpe form adds required *Shahar / viloyat* and *Tuman* fields.
- **Buyurtmalarim (seller):** a Koreya / Oʻzbekiston switch; orders grouped by box (the open box
  first, labelled "Ochiq quti", then closed boxes newest first, then pending orders on top as
  "Tasdiq kutilmoqda"). Each row: client name · quantity · city/district · phone · status.
- **Tekpe → Qutilar (manager):** a tab listing boxes by status (Ochiq / Yopilgan / Olib ketildi):
  seller, country, orders, items, weight. Open: *Yopish va chop etish*. Closed: *Chop etish*,
  *Olib ketildi*. Seller orders no longer appear in the per-order Yangi/Tayyor tabs.
- **Box list A4** (`/print/box/[id]`): box number, seller name, country, date; one row per client:
  No. · name · phone · city/district · quantity · order number, with that client's items beneath;
  footer: clients, items, weight, box shipping. No cost or profit.
- Order detail and Buyurtmalar show the box number and city/district for seller orders; the per-order
  print button is hidden for orders in a box.

## Ombor: stock only through Tahrirlash

- The product list shows stock read-only (number and the low-stock bar); the inline ±10 stepper and
  tap-to-type field are removed from the list (desktop table and phone cards).
- The Tahrirlash dialog gets an *Ombordagi miqdor* field with −10 / +10 buttons and direct typing.
  Nothing is written until **Saqlash**; then the new quantity is saved with `adjust_stock(id, new,
  expected)`, so a change made on another device meanwhile raises `STOCK_CHANGED` instead of being
  overwritten. A stock change is recorded as an `adjust` movement, as today.
- Kirim (restock with cost) and sales are unchanged.

## Statistika

Box shipping counts in the shipping totals on the day the box is closed (seller scope = box seller).

## Testing

SQL: submit requires city/district and stores them with zero shipping; approve creates/reuses the
open box per seller and destination; close computes shipping (KR flat, UZ rounded kg) and sets
orders `ready`; next approval opens a new box; picked up cascades; cancel in open box detaches,
in closed box refuses; sellers see only their own boxes; manager-only close/pick-up.
Unit: grouping of seller orders by box for Buyurtmalarim.
Ombor: the edit form only calls `adjust_stock` when the quantity changed, with the quantity it was
opened with as the expected value (covered by the existing 04_stock tests for the RPC).
