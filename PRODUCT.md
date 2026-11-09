# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Guli cosmetics's owner (the main salesman) and up to ~9 staff. They ring up sales all day at a store counter in Korea, scan stock in when deliveries arrive, and prepare Tekpe (택배) parcels for customers in Korea and Uzbekistan. The owner also reads the overall numbers; staff see only their own sales. A developer admin manages accounts and settings and never sells.

## Product Purpose

An internal point-of-sale and order system: scan barcodes to build an order, record the customer by phone number, take payment (cash, card, transfer), print an A4 order sheet with a private QR code, and move shipping orders New → Ready → Picked up by scanning that QR. Stock stays correct across every device in real time. Success: a sale takes seconds, stock is never wrong, and no parcel is lost between packing and pickup.

## Positioning

Built for one business's exact counter ritual — USB scanner, wholesale ("optom") toggle per line, two-currency shipping (₩ flat for Korea, $/kg for Uzbekistan), Tekpe QR handoff — rather than a generic retail POS.

## Operating Context

- Primary: Windows desktop at the counter with a USB keyboard-wedge barcode scanner and a black-and-white A4 printer (silent printing via an Electron .exe in Phase 2). Desktop is the main screen.
- Secondary: staff phones (Android and iPhone browsers) for checkout, stock checks and Tekpe, using the camera as a barcode/QR scanner.
- Online only; one shared Supabase database for all devices.
- Customers never see the app. They may receive the printed sheet inside their parcel, so the sheet must not reveal costs, profit, staff accounts, or that a POS system exists.

## Capabilities and Constraints

- UI language: Uzbek (Latin) only, with correct ʻ (U+02BB) and ʼ (U+02BC). Terms: Kassa, Ombor, Buyurtmalar, Tekpe, Optom, Naqd/Karta/Oʻtkazma.
- Money in KRW integers (`85 000 ₩`); Uzbekistan shipping in USD (`30 $`); totals for Uzbekistan shown in two parts (`85 000 ₩ + 30 $`).
- Phones default to Korea (+82) with Uzbekistan (+998) as an option.
- Roles: root/admin (accounts/settings only), manager (the store, approves seller orders, sees profit), seller (remote Tekpe orders for approval, own sales without cost).

## Brand Commitments

- Platform is in Guli cosmetics's name. Page background light gray `#f2f2f0`, primary buttons sand beige `#e8d9c4` with dark text (client changed this on 2026-10-23: the original `#fcf2f0` / `#f8ad9d` pink read as too girly).
- Logo: `Guli.webp` (Guli cosmetics). Wordmark on the printed sheets and login; the flower alone as the app mark and Windows icon.
- Must not feel cute or girly: no pink overload or decorative fluff that hurts readability.

## Evidence on Hand

- Logo: `Guli.webp` (Guli cosmetics). Wordmark on the printed sheets and login; the flower alone as the app mark and Windows icon.
- No real product catalogue yet — the client will enter every product by hand. No customer data, testimonials or metrics exist; never fabricate them.

## Product Principles

1. Speed at the counter beats everything: fewest taps, scanner always ready, the primary action obvious.
2. Numbers are the interface: prices, quantities, totals and stock must be instantly readable at a glance.
3. Never lose stock or a parcel: every change is recorded, and destructive actions confirm.
4. Calm, professional, quietly branded — neutral gray ground, beige reserved for actions; the rose pink lives only in the Guli logo.

## Accessibility & Inclusion

Long shifts on a counter screen: high-contrast text for numbers, large touch targets on phones, full keyboard operation on desktop (scanner, F-key shortcuts), visible focus.
