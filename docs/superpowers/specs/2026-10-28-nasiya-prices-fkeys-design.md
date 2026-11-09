# Nasiya, price order, F-key navigation, desktop 0.2.0

Date: 2026-10-28 · Status: approved in chat

## Nasiya (installment)

- Payment method `credit`, label **Nasiya**. Buttons everywhere in the order
  **Oʻtkazma · Naqd · Nasiya · Karta**; Naqd stays the default.
- Kassa and the sellers' Sotuv form offer it. A Nasiya order must have a client with phone and
  name (`NASIYA_NEEDS_CUSTOMER`, enforced in the database).
- Debt = goods + Korean shipping in ₩ (`subtotal + shipping_krw`). Uzbekistan $ shipping is paid
  separately and is not part of the debt.
- `orders.paid_krw` (sum of payments) and a stored `credit_due_krw` (what is left; 0 for other
  methods). Table `credit_payments` (order, amount ₩ > 0, paid_at, recorded_by), managers only.
- `record_credit_payment(order, amount)`: managers; only approved, not cancelled Nasiya orders;
  amount > 0 (`INVALID_AMOUNT`) and ≤ what is left (`CREDIT_OVERPAY`). At 0 left the order is paid.
- Cancelling a Nasiya order drops its debt; payments stay in its history.
- Buyurtmalar gets a submenu **Barcha buyurtmalar | Nasiya**. Nasiya: total outstanding; filter
  **Qarzdorlar / Toʻlangan**; rows client · phone · order № · date · total · paid · left;
  **Toʻlov qoʻshish** (amount defaults to what is left). Order detail shows the payment history and
  the same button.
- Sellers see paid / left on their own orders (read-only). Statistika lists Nasiya as a fourth
  payment type.

## Prices

Add and edit ask **Tan narxi → Optom narxi → Dona narxi**; these names are used across the app.

## F keys (managers)

F1 Kassa (on Kassa: focus the search/scan field — this was F2), F2 Ombor, F3 Buyurtmalar,
F4 Tekpe; F9 checkout unchanged. Desktop menu shows the key next to each item.

## Desktop 0.2.0

The .exe prints box lists silently (`/print/box/<id>`, same sheet check as orders). Installer
version 0.2.0.

## Testing

SQL: Nasiya needs a client; payments lower the debt; overpay and zero refused; paid at 0;
pending/cancelled refused; managers only; sellers see paid on their orders, not the table.
Unit: debt helpers, F-key mapping, desktop box print URL.
