"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Krw } from "@/components/money";
import { useOnline } from "@/components/shell/use-online";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CartRow } from "@/features/checkout/cart-row";
import type { CustomerState } from "@/features/checkout/customer-panel";
import { cartFingerprint, resolveRequest, type Payload } from "@/features/checkout/request-key";
import { TekpeDialog } from "@/features/checkout/tekpe-dialog";
import { useCart, type CartKeys } from "@/features/checkout/use-cart";
import { CATALOG_PAGE, getMyOrder, sellerCatalog, submitSellerOrder } from "@/lib/data/seller";
import { getShippingRates } from "@/lib/data/settings";
import type { CartProduct } from "@/lib/domain/cart";
import { errorMessage } from "@/lib/domain/errors";
import { isNetworkError, REQUEST_TIMEOUT_MS } from "@/lib/domain/network";
import { formatOrderNo } from "@/lib/domain/order-no";
import { normalizePhone } from "@/lib/domain/phone";
import type { ShippingRates } from "@/lib/domain/shipping";
import type { Destination } from "@/lib/domain/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { CatalogGrid } from "./catalog-grid";

const SELLER_CART: CartKeys = { cart: "guli.seller.cart", request: "guli.seller.request" };
const EMPTY_CUSTOMER: CustomerState = { country: "KR", phone: "", name: "", payment: "cash", city: "", district: "" };

export function SellScreen() {
  const router = useRouter();
  const online = useOnline();
  const { lines, dispatch, totals, loadRequest, saveRequest, finishOrder } = useCart(SELLER_CART);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; rows: CartProduct[]; more: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [customer, setCustomer] = useState<CustomerState>(EMPTY_CUSTOMER);
  const [rates, setRates] = useState<ShippingRates | null>(null);
  const [fresh, setFresh] = useState<{ id: string; n: number } | null>(null);
  const [tekpeOpen, setTekpeOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Destination | null>(null);
  const q = query.trim();
  const empty = lines.length === 0;

  useEffect(() => {
    getShippingRates(supabaseBrowser()).then(setRates).catch((e) => toast.error(errorMessage(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      sellerCatalog(supabaseBrowser(), q)
        .then((rows) => !cancelled && setResult({ q, rows, more: rows.length === CATALOG_PAGE }))
        .catch((e) => !cancelled && toast.error(errorMessage(e)));
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  async function loadMore() {
    if (!result || loadingMore) return;
    setLoadingMore(true);
    try {
      const rows = await sellerCatalog(supabaseBrowser(), result.q, result.rows.length);
      setResult((r) => (r && r.q === result.q ? { q: r.q, rows: [...r.rows, ...rows], more: rows.length === CATALOG_PAGE } : r));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  function add(p: CartProduct) {
    dispatch({ type: "add", product: p });
    setFresh((f) => ({ id: p.id, n: (f?.n ?? 0) + 1 }));
  }

  async function submit(destination: Destination) {
    if (empty || busy || !online) return;
    const phone = normalizePhone(customer.phone, customer.country);
    const name = customer.name.trim();
    const city = customer.city?.trim() ?? "";
    const district = customer.district?.trim() ?? "";
    if (!phone || !name || !city || !district) return;
    setBusy(true);
    setFailed(null);
    const sb = supabaseBrowser();
    const payload: Payload = {
      items: lines.map((l) => ({ product_id: l.id, qty: l.qty, is_wholesale: l.isWholesale })),
      type: "tekpe",
      destination,
      phone,
      name,
      payment: customer.payment,
      city,
      district,
    };
    const fp = cartFingerprint(payload);
    try {
      const decision = await resolveRequest(loadRequest(), fp, (requestId) => getMyOrder(sb, { requestId }), () => crypto.randomUUID());
      if (decision.kind === "placed") {
        // The earlier attempt did go through; keep the edited cart so nothing is lost.
        saveRequest(null);
        setTekpeOpen(false);
        toast.warning(uz.checkout.earlierPlaced(formatOrderNo(decision.order.order_no)), { duration: 12_000 });
        return;
      }
      saveRequest({ id: decision.id, fp });
      const order = await submitSellerOrder(
        sb,
        { requestId: decision.id, items: payload.items, phone, name, city, district, payment: customer.payment, destination },
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );
      finishOrder();
      setTekpeOpen(false);
      setSheetOpen(false);
      setCustomer((c) => ({ ...EMPTY_CUSTOMER, payment: c.payment }));
      toast.success(uz.seller.sent(formatOrderNo(order.order_no)));
      router.push("/buyurtmalarim");
    } catch (e) {
      if (isNetworkError(e)) setFailed(destination);
      else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const loading = result?.q !== q;
  const products = result?.rows ?? [];
  const qtyInCart = (id: string) => lines.find((l) => l.id === id)?.qty ?? 0;

  const cart = (
    <div className="flex h-full flex-col">
      {empty ? (
        <p className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center text-ink-2">
          <ShoppingBag className="size-10 text-ink-3" strokeWidth={1.25} aria-hidden />
          {uz.seller.cartEmpty}
        </p>
      ) : (
        <ol className="flex-1 overflow-y-auto">
          {lines.map((line, i) => {
            const isFresh = fresh?.id === line.id;
            return <CartRow key={isFresh ? `${line.id}-${fresh.n}` : line.id} line={line} index={i} fresh={isFresh} dispatch={dispatch} compact />;
          })}
        </ol>
      )}
      <div className="border-t border-ink p-3">
        <div className="mb-3 flex items-end justify-between gap-2">
          <span className="caption">
            {uz.checkout.total} · {totals.itemCount} {uz.common.pcs}
          </span>
          <Krw value={totals.subtotal} className="monument text-3xl" />
        </div>
        <Button size="lg" className="w-full" disabled={empty || !online} onClick={() => setTekpeOpen(true)}>
          {uz.seller.order}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="waybill grid flex-1 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="flex min-w-0 flex-col lg:border-r lg:border-ink" aria-label={uz.seller.sellTitle}>
        <div className="border-b border-ink p-2">
          <label className="relative block">
            <span className="sr-only">{uz.common.search}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={uz.seller.searchPlaceholder}
              className="h-11 pl-9 text-base"
            />
          </label>
        </div>

        {failed && (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-ink bg-warn-soft px-3 py-2.5 text-sm font-medium text-warn">
            {uz.checkout.networkError}
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => submit(failed)} disabled={busy}>
              <RotateCw aria-hidden />
              {uz.common.retry}
            </Button>
          </div>
        )}

        <div className="flex-1 pb-24 lg:pb-0">
          {loading && !result ? (
            <div className="grid grid-cols-2 gap-px sm:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <Skeleton key={i} className="h-60 rounded-none" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <p className="px-4 py-16 text-center text-ink-2">{uz.seller.noProducts}</p>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : undefined}>
              <CatalogGrid products={products} qtyInCart={qtyInCart} onAdd={add} />
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
      </section>

      <aside className="hidden lg:block" aria-label={uz.seller.cart}>
        {cart}
      </aside>

      {/* Phone/tablet: sticky total strip above the bottom nav opens the cart as a sheet. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-ink bg-cell px-3 py-2 md:bottom-0 lg:hidden">
        <div className="min-w-0 flex-1">
          <span className="caption">
            {uz.seller.cart} · {totals.itemCount} {uz.common.pcs}
          </span>
          <Krw value={totals.subtotal} className="monument block text-2xl" />
        </div>
        <Button size="lg" onClick={() => setSheetOpen(true)} disabled={empty}>
          {uz.checkout.continue}
        </Button>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto border-t border-ink p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-ink px-4 py-3">
            <SheetTitle>{uz.seller.cart}</SheetTitle>
            <SheetDescription className="sr-only">{uz.seller.order}</SheetDescription>
          </SheetHeader>
          {cart}
        </SheetContent>
      </Sheet>

      <TekpeDialog
        open={tekpeOpen}
        onOpenChange={setTekpeOpen}
        state={customer}
        onChange={(patch) => setCustomer((s) => ({ ...s, ...patch }))}
        totals={totals}
        rates={rates}
        busy={busy}
        offline={!online}
        showPayment
        showAddress
        confirmLabel={uz.seller.send}
        onConfirm={submit}
      />
    </div>
  );
}
