# Order edit, Nasiya in the main menu, "Hammasi optom"

Date: 2026-11-02 · Status: approved in chat

## Edit a finished order (managers)

- Order page → **Tahrirlash**: client name, phone, payment method. Items, prices and stock never change.
- RPC `update_order_info(order, phone, name, payment)`, managers only; cancelled orders refused
  (`ORDER_CANCELLED`). A phone links the order to that client (created if new; name updated, since
  the name belongs to the client). Blank phone unlinks the client.
- Tekpe orders keep a name and phone (`TEKPE_NEEDS_CUSTOMER`); Nasiya needs them
  (`NASIYA_NEEDS_CUSTOMER`). Leaving Nasiya once a payment is recorded is refused
  (`CREDIT_HAS_PAYMENTS`); switching to Nasiya makes the order owe its total.

## Nasiya in the main menu

`/nasiya`, after Buyurtmalar and before Tekpe; the Buyurtmalar submenu goes away.
Keys: F1 Kassa, F2 Ombor, F3 Buyurtmalar, F4 Nasiya, F5 Tekpe (F5 no longer reloads in the app).

## Hammasi optom (Kassa)

A switch above the cart: on sets every line to Optom and new scans arrive as Optom; single lines can
still be switched back; off returns every line to normal prices. A new order starts with it off.

## Testing

SQL: edit name/phone/payment, new phone creates the client, blank phone unlinks a store order,
Tekpe and Nasiya keep a client, cancelled refused, leaving Nasiya with payments refused, managers only.
Unit: cart "all wholesale" and adding while on; F-key mapping.
