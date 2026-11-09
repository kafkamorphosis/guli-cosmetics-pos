# Guli cosmetics POS

Point-of-sale and order management for Guli cosmetics: checkout with barcode scanning (USB scanner or phone camera), inventory, orders, A4 order sheets with a private QR code, and the Tekpe (택배) shipping board. Uzbek (Latin) UI. Next.js 16 on Vercel + Supabase.

- Design spec: `docs/superpowers/specs/2026-10-23-unity-beauty-pos-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-10-23-unity-beauty-pos-phase1.md`
- Product record and visual direction: `PRODUCT.md`, `.impeccable/surfaces/`

## Local setup

Requires Node 24.

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local`:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → publishable key |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret key (server only, never commit) |
| `SUPABASE_DB_URL` | Supabase → Connect → Session pooler URI (only for `npm run test:db`) |

```bash
npm run dev
```

## First admin account

Accounts are created only by an admin (there is no self sign-up). Create the first admin from your terminal:

```bash
node scripts/create-admin.mjs
```

Then in Supabase → Authentication → Sign In / Providers, turn **off** "Allow new users to sign up". (Even if it stays on, accounts created outside the admin panel get no access.)

Sign in at `/login` with that admin, open **Akkauntlar**, and create the manager and seller accounts.

| Role | Shown as | Does |
|---|---|---|
| `admin` | Root | Accounts and settings only |
| `manager` | Menejer | The store: Kassa, Ombor, Buyurtmalar, Tekpe (approves seller orders), Mijozlar, Statistika with profit, Bildirishnomalar |
| `seller` | Sotuvchi | Sotuv (catalog, cart, Tekpe order for approval), Buyurtmalarim, own Statistika without cost |

Seller orders start as *Tasdiq kutilmoqda* and hold no stock; a manager's Tasdiqlash takes the stock and moves them to Yangi.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Database tests in rolled-back transactions (needs `SUPABASE_DB_URL`) |
| `npm run e2e` | Playwright smoke test (needs `.env.test.local` with `E2E_SELLER_USER` / `E2E_SELLER_PASS`) |
| `npm run lint` / `npm run build` | Lint / production build |
| `node scripts/prepare-logos.mjs` | Rebuilds `public/brand/*` from `Guli.webp` |

After `npm run e2e`, remove its test data by running `supabase/e2e-cleanup.sql` in the Supabase SQL editor.

## Database

Migrations live in `supabase/migrations/` and are already applied to the project. Business writes (checkout, cancel, restock, stock adjust, Tekpe status) go through Postgres functions; the browser can only read tables, so stock and orders stay consistent across every device.

## Deploy (GitHub → Vercel)

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, import the repository (framework: Next.js).
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
4. Deploy. Then in Supabase → Authentication → URL Configuration, set **Site URL** to the Vercel URL.

Phones: open the Vercel URL in Chrome or Safari and use "Add to Home screen". The camera scanner needs HTTPS (Vercel provides it).

## Printing

In a browser, "Chop etish" opens the print dialog with the A4 sheet. In the Windows app it prints silently to the chosen printer.

## Windows ilovasi (desktop app)

The `desktop/` folder is a separate Electron app that opens the web app and adds silent A4 printing.

Build the installer (once per version):

```bash
npm --prefix desktop install
npm --prefix desktop test
npm --prefix desktop run dist
```

Keyboard (managers): F1 Kassa (on Kassa: focus the scan field), F2 Ombor, F3 Buyurtmalar, F4 Nasiya, F5 Tekpe, F9 checkout.

The installer is `desktop/dist/GuliCosmeticsPOS-Setup-<version>.exe`. From 0.2.0 it also prints seller box lists silently. To bake in your live address, put it in `desktop/config.json` (`{ "url": "https://your-app.vercel.app" }`) before `run dist`; otherwise the app asks for it on first start.

On the shop PC:

1. Run the installer. It isn't code-signed, so Windows SmartScreen may warn: **More info → Run anyway**.
2. On first start, set the **Ilova manzili** (your Vercel URL) and pick the **Printer**, then press **Sinov chop etish** — a test page should come out with no dialog.
3. Sign in as usual. "Chop etish" in Kassa, Buyurtmalar and Tekpe now prints straight to the printer.
4. Change the address or printer any time: menu **Ilova → Printer va manzil sozlamalari** (Ctrl+,). Press Alt to show the menu.

For development: `npm --prefix desktop start -- --url=http://localhost:3000 --dev`.

## Telegram alerts

Admin → Sozlamalar → **Telegram xabarnomalari**: create a bot with @BotFather, paste its token, send `/start` to the bot, press **Chatni topish**, choose the chat, switch alerts on and **Saqlash**, then **Sinov xabarini yuborish**. You'll get a message when a product drops to its "kam qoldi" level and for every new Tekpe order.

## Telegram doʻkon (customer shop bot)

Customers shop inside Telegram: the bot opens the catalog as a Mini App (`/shop`), they fill a cart, give phone, name, city and district, choose Koreya or Oʻzbekiston, and send. No VPS: the shop runs on the same Vercel app.

- The order lands in **Buyurtmalar** as *Tasdiq kutilmoqda* from the seller **Telegram doʻkon**, and the alerts bot announces it like any Tekpe order. *Tasdiqlash* takes the stock; the order ships on its own (per-order shipping, no seller box) and continues on the Tekpe board.
- Customers see retail prices and only *Mavjud* / *Tugagan*, never cost or stock counts. They can't order more than is in stock and can have at most 5 orders waiting for approval.
- The customer gets a bot message when the order is approved, packed, picked up by Tekpe, or cancelled. **Buyurtmalarim** in the shop lists their orders.
- Payment is recorded as Oʻtkazma; the manager agrees the payment with the client and can change it with Tahrirlash.

Setup (once, needs `SUPABASE_SECRET_KEY` on Vercel):

1. In @BotFather create a **separate** bot for customers (the alerts bot keeps using getUpdates, which a webhook would break) and copy its token.
2. Open the live app (https), sign in as admin → Sozlamalar → **Telegram doʻkon** → paste the token → **Ulash**. This sets the webhook (`/api/telegram/shop`), the chat menu button and `/start`.
3. Open the bot, send `/start`, press **Doʻkonni ochish**.

Database side: `supabase/migrations/20261109000018_telegram_shop.sql` (shop RPCs are granted to `service_role` only; the server checks Telegram's signed `initData` in `src/lib/shop/init-data.ts`).
