"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Script from "next/script";
import { Plus, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Krw } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CartRow } from "@/features/checkout/cart-row";
import type { CustomerState } from "@/features/checkout/customer-panel";
import { cartFingerprint, type Payload } from "@/features/checkout/request-key";
import { TekpeDialog } from "@/features/checkout/tekpe-dialog";
import { useCart, type CartKeys } from "@/features/checkout/use-cart";
import type { CartProduct } from "@/lib/domain/cart";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { normalizePhone } from "@/lib/domain/phone";
import type { ShippingRates } from "@/lib/domain/shipping";
import type { Destination } from "@/lib/domain/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { fetchCatalog, placeOrder, telegramApp } from "./shop-api";
import { ShopOrders } from "./shop-orders";

const SHOP_CART: CartKeys = { cart: "guli.shop.cart", request: "guli.shop.request" };

type Phase = "loading" | "ready" | "outside";

export function ShopScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [initData, setInitData] = useState("");
  const [tab, setTab] = useState<"catalog" | "orders">("catalog");
  const [ordersKey, setOrdersKey] = useState(0);

  const boot = useCallback(() => {
    const tg = telegramApp();
    if (!tg) return void setPhase("outside");
    tg.ready();
    tg.expand();
    setInitData(tg.initData);
    setPhase("ready");
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" onReady={boot} onError={() => setPhase("outside")} />
      <header className="flex items-center gap-3 border-b border-ink bg-cell px-3 py-2">
        <Image src="/brand/guli.png" alt={uz.shop.title} width={110} height={48} priority className="h-10 w-auto" />
        <nav className="ml-auto flex overflow-hidden rounded-sm border border-ink" aria-label={uz.shop.title}>
          {(["catalog", "orders"] as const).map((t, i) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={cn("px-3 py-2 text-sm font-semibold", i > 0 && "border-l border-ink", tab === t ? "bg-ink text-cell" : "bg-cell")}
            >
              {t === "catalog" ? uz.shop.tabCatalog : uz.shop.tabOrders}
            </button>
          ))}
        </nav>
      </header>

      {phase === "loading" && <Skeleton className="m-3 h-[60dvh] rounded-none" />}
      {phase === "outside" && <p className="px-6 py-20 text-center text-ink-2">{uz.shop.openInTelegram}</p>}
      {phase === "ready" && (
        <>
          <div className={tab === "catalog" ? "contents" : "hidden"}>
            <ShopCatalog
              initData={initData}
              onOrdered={() => {
                setOrdersKey((k) => k + 1);
                setTab("orders");
              }}
            />
          </div>
          {tab === "orders" && <ShopOrders key={ordersKey} initData={initData} />}
        </>
      )}
    </main>
  );
}

function ShopCatalog({ initData, onOrdered }: { initData: string; onOrdered(): void }) {
  const { lines, dispatch, totals, loadRequest, saveRequest, finishOrder } = useCart(SHOP_CART);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; rows: CartProduct[]; more: boolean } | null>(null);
  const [rates, setRates] = useState<ShippingRates | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState<CustomerState>(() => ({
    country: "KR",
    phone: "",
    name: telegramApp()?.initDataUnsafe?.user?.first_name ?? "",
    payment: "transfer",
    city: "",
    district: "",
  }));
  const q = query.trim();
  const empty = lines.length === 0;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchCatalog(initData, q, 0)
        .then((r) => {
          if (cancelled) return;
          setResult({ q, rows: r.products, more: r.more });
          if (r.rates) setRates(r.rates);
        })
        .catch((e) => !cancelled && toast.error(errorMessage(e)));
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [initData, q]);

  async function loadMore() {
    if (!result || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await fetchCatalog(initData, result.q, result.rows.length);
      setResult((cur) => (cur && cur.q === result.q ? { q: cur.q, rows: [...cur.rows, ...r.products], more: r.more } : cur));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit(destination: Destination) {
    if (empty || busy) return;
    const phone = normalizePhone(customer.phone, customer.country);
    const name = customer.name.trim();
    const city = customer.city?.trim() ?? "";
    const district = customer.district?.trim() ?? "";
    if (!phone || !name || !city || !district) return;
    const items = lines.map((l) => ({ product_id: l.id, qty: l.qty }));
    const payload: Payload = { items: items.map((i) => ({ ...i, is_wholesale: false })), type: "tekpe", destination, phone, name, payment: "transfer", city, district };
    const fp = cartFingerprint(payload);
    // Same cart and details as a lost attempt → same request id, so the server never makes two orders.
    const stored = loadRequest();
    const requestId = stored && stored.fp === fp ? stored.id : crypto.randomUUID();
    saveRequest({ id: requestId, fp });
    setBusy(true);
    try {
      const order = await placeOrder(initData, { requestId, items, phone, name, city, district, destination });
      finishOrder();
      setDialogOpen(false);
      setSheetOpen(false);
      telegramApp()?.HapticFeedback?.notificationOccurred("success");
      toast.success(uz.shop.sent(formatOrderNo(order.order_no)), { duration: 10_000 });
      onOrdered();
    } catch (e) {
      telegramApp()?.HapticFeedback?.notificationOccurred("error");
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const loading = result?.q !== q;
  const products = result?.rows ?? [];
  const qtyInCart = (id: string) => lines.find((l) => l.id === id)?.qty ?? 0;

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-ink bg-cell p-2">
        <label className="relative block">
          <span className="sr-only">{uz.common.search}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={uz.shop.searchPlaceholder} className="h-11 pl-9 text-base" />
        </label>
      </div>

      <div className="flex-1 pb-24">
        {loading && !result ? (
          <div className="grid grid-cols-2 gap-px sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-60 rounded-none" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="px-4 py-16 text-center text-ink-2">{uz.shop.noProducts}</p>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : undefined}>
            <ul className="grid grid-cols-2 gap-px bg-rule-soft sm:grid-cols-3">
              {products.map((p) => {
                const inCart = qtyInCart(p.id);
                const available = p.stock > 0;
                return (
                  <li key={p.id} className="bg-cell">
                    <button
                      type="button"
                      disabled={!available}
                      onClick={() => dispatch({ type: "add", product: p })}
                      aria-label={uz.seller.add(p.name)}
                      className={cn(
                        "group flex h-full w-full flex-col gap-2 p-3 text-left transition-colors duration-150 active:bg-sand-soft disabled:opacity-55",
                        inCart > 0 && "bg-sand-soft/40",
                      )}
                    >
                      <ProductThumb path={p.photoPath} size={96} className="w-full! aspect-square h-auto!" />
                      <span className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold">{p.name}</span>
                      <span className="flex items-end justify-between gap-2">
                        <Krw value={p.retailPrice} className="text-base font-bold" />
                        {available && (
                          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-ink bg-sand text-sand-ink">
                            <Plus className="size-4" />
                          </span>
                        )}
                      </span>
                      <span className={cn("text-xs", available ? "text-ink-3" : "font-semibold text-warn")}>
                        {available ? uz.shop.inStock : uz.shop.outOfStock}
                        {inCart > 0 && <span className="ml-2 font-bold text-ink">· {uz.seller.inCart(inCart)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {result?.more && (
              <div className="flex justify-center border-t border-ink p-3">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {uz.seller.loadMore}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-3xl items-center gap-3 border-t border-ink bg-cell px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          <span className="caption">
            {uz.shop.cart} · {totals.itemCount} {uz.common.pcs}
          </span>
          <Krw value={totals.subtotal} className="monument block text-2xl" />
        </div>
        <Button size="lg" onClick={() => setSheetOpen(true)} disabled={empty}>
          <ShoppingBag aria-hidden />
          {uz.shop.cart}
        </Button>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto border-t border-ink p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-ink px-4 py-3">
            <SheetTitle>{uz.shop.cart}</SheetTitle>
            <SheetDescription className="sr-only">{uz.shop.checkout}</SheetDescription>
          </SheetHeader>
          {empty ? (
            <p className="px-6 py-12 text-center text-ink-2">{uz.shop.cartEmpty}</p>
          ) : (
            <ol>
              {lines.map((line, i) => (
                <CartRow key={line.id} line={line} index={i} fresh={false} dispatch={dispatch} compact hideOptom />
              ))}
            </ol>
          )}
          <div className="border-t border-ink p-3">
            <Button size="lg" className="w-full" disabled={empty} onClick={() => setDialogOpen(true)}>
              {uz.shop.checkout}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <TekpeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        state={customer}
        onChange={(patch) => setCustomer((s) => ({ ...s, ...patch }))}
        totals={totals}
        rates={rates}
        busy={busy}
        showAddress
        shipsAlone
        confirmLabel={uz.shop.send}
        onConfirm={submit}
      />
    </>
  );
}
