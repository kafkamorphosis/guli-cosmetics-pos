"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, RotateCw, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { scanFeedback } from "@/components/scanner/feedback";
import { useHidScanner } from "@/components/scanner/use-hid-scanner";
import { useOnline } from "@/components/shell/use-online";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Order, Product } from "@/lib/database.types";
import { lookupCustomer, type CustomerSummary } from "@/lib/data/customers";
import { findProductByBarcode } from "@/lib/data/products";
import { getShippingRates } from "@/lib/data/settings";
import type { CartProduct } from "@/lib/domain/cart";
import { errorMessage } from "@/lib/domain/errors";
import { isNetworkError, REQUEST_TIMEOUT_MS } from "@/lib/domain/network";
import { formatKrw } from "@/lib/domain/money";
import { formatOrderNo } from "@/lib/domain/order-no";
import { normalizePhone } from "@/lib/domain/phone";
import type { ShippingRates } from "@/lib/domain/shipping";
import type { Destination } from "@/lib/domain/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { CartRow } from "./cart-row";
import { CustomerPanel, type CustomerState } from "./customer-panel";
import { ProductSearch } from "./product-search";
import { SuccessDialog } from "./success-dialog";
import { TekpeDialog } from "./tekpe-dialog";
import { cartFingerprint, resolveRequest, type Payload } from "./request-key";
import { KASSA_CART, useCart } from "./use-cart";

const EMPTY_CUSTOMER: CustomerState = { country: "KR", phone: "", name: "", payment: "cash" };

function toCartProduct(p: Product): CartProduct {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    photoPath: p.photo_path,
    retailPrice: p.retail_price,
    wholesalePrice: p.wholesale_price,
    weightG: p.weight_g,
    stock: p.stock,
  };
}

type Attempt = { type: "store" } | { type: "tekpe"; destination: Destination };


export function CheckoutScreen() {
  const { lines, dispatch, totals, loadRequest, saveRequest, finishOrder } = useCart(KASSA_CART);
  const online = useOnline();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [customerState, setCustomerState] = useState<CustomerState>(EMPTY_CUSTOMER);
  const [lookup, setLookup] = useState<{ phone: string; result: CustomerSummary | null } | null>(null);
  const [rates, setRates] = useState<ShippingRates | null>(null);
  const [fresh, setFresh] = useState<{ id: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Attempt | null>(null);
  const [success, setSuccess] = useState<Order | null>(null);
  const [tekpeOpen, setTekpeOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [camera, setCamera] = useState(false);
  // Hammasi optom: every line at the wholesale price, new scans too; single lines can switch back.
  const [allOptom, setAllOptom] = useState(() => lines.length > 0 && lines.every((l) => l.isWholesale));

  const phone = normalizePhone(customerState.phone, customerState.country);
  const phoneDigits = customerState.phone.replace(/\D/g, "").length;
  const phoneInvalid = phoneDigits >= 9 && phone === null;
  const customer = phone && lookup?.phone === phone ? lookup.result : undefined;
  const dialogOpen = tekpeOpen || success !== null || camera;
  const empty = lines.length === 0;

  useEffect(() => {
    getShippingRates(supabaseBrowser()).then(setRates).catch((e) => toast.error(errorMessage(e)));
  }, []);

  // A cart restored from an earlier visit gets today's prices and stock before anything is sold.
  const [restoredIds] = useState(() => lines.map((l) => l.id));
  useEffect(() => {
    if (restoredIds.length === 0) return;
    supabaseBrowser()
      .from("products")
      .select("*")
      .in("id", restoredIds)
      .eq("is_archived", false)
      .then(({ data }) => data && dispatch({ type: "refresh", ids: restoredIds, products: data.map(toCartProduct) }));
  }, [restoredIds, dispatch]);

  useEffect(() => {
    if (!phone) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await lookupCustomer(supabaseBrowser(), phone).catch(() => null);
      if (cancelled) return;
      setLookup({ phone, result });
      if (result?.name) setCustomerState((s) => (s.name.trim() ? s : { ...s, name: result.name ?? "" }));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone]);

  function addProduct(p: Product) {
    dispatch({ type: "add", product: toCartProduct(p), wholesale: allOptom });
    setFresh((f) => ({ id: p.id, n: (f?.n ?? 0) + 1 }));
  }

  async function addByBarcode(code: string) {
    try {
      const product = await findProductByBarcode(supabaseBrowser(), code);
      if (!product) {
        scanFeedback(false);
        toast.error(`${uz.checkout.notFound}: ${code}`, {
          action: { label: uz.checkout.addToInventory, onClick: () => router.push(`/ombor?barcode=${encodeURIComponent(code)}`) },
        });
        return;
      }
      scanFeedback(true);
      addProduct(product);
    } catch (e) {
      scanFeedback(false);
      toast.error(errorMessage(e));
    }
  }

  // Always listening, so a scan never types into a dialog field or presses its focused button.
  // Over the success dialog a scan starts the next order; in the Tekpe dialog it adds to the cart.
  useHidScanner((code) => {
    if (success) newOrder();
    addByBarcode(code);
  });

  async function submit(attempt: Attempt) {
    if (empty || busy || !online) return;
    if (customerState.phone.trim() && !phone) {
      toast.error(uz.checkout.phoneInvalid);
      return;
    }
    // Selling on credit needs to know who owes (the database refuses it too).
    if (customerState.payment === "credit" && (!phone || !customerState.name.trim())) {
      toast.error(uz.errors.NASIYA_NEEDS_CUSTOMER);
      return;
    }
    setBusy(true);
    setFailed(null);
    const sb = supabaseBrowser();
    const payload: Payload = {
      items: lines.map((l) => ({ product_id: l.id, qty: l.qty, is_wholesale: l.isWholesale })),
      type: attempt.type,
      destination: attempt.type === "tekpe" ? attempt.destination : null,
      phone,
      name: customerState.name.trim() || null,
      payment: customerState.payment,
    };
    const fp = cartFingerprint(payload);
    let decision;
    try {
      decision = await resolveRequest(
        loadRequest(),
        fp,
        async (requestId) => {
          const { data, error } = await sb
            .from("orders")
            .select("*")
            .eq("request_id", requestId)
            .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
            .maybeSingle();
          if (error) throw error;
          return data;
        },
        () => crypto.randomUUID(),
      );
    } catch (e) {
      setBusy(false);
      if (isNetworkError(e)) setFailed(attempt);
      else toast.error(errorMessage(e));
      return;
    }
    if (decision.kind === "placed") {
      // The earlier attempt did go through. Show it, and keep the edited cart so nothing is lost.
      saveRequest(null);
      setBusy(false);
      setTekpeOpen(false);
      setSheetOpen(false);
      setSuccess(decision.order);
      toast.warning(uz.checkout.earlierPlaced(formatOrderNo(decision.order.order_no)), { duration: 12_000 });
      return;
    }
    saveRequest({ id: decision.id, fp });
    const { data, error } = await sb.rpc("create_order", {
      p_request_id: decision.id,
      p_items: payload.items,
      p_customer_phone: payload.phone,
      p_customer_name: payload.name,
      p_payment_method: payload.payment,
      p_type: payload.type,
      p_destination: payload.destination,
    }).abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
    setBusy(false);
    if (error) {
      if (isNetworkError(error)) setFailed(attempt);
      else toast.error(errorMessage(error));
      return;
    }
    // The order exists now: drop the cart and its request key right away, so leaving Kassa
    // without pressing "Yangi buyurtma" can't resubmit (and silently return) this order.
    finishOrder();
    setTekpeOpen(false);
    setSheetOpen(false);
    setSuccess(data);
  }

  function newOrder() {
    setSuccess(null);
    setCustomerState((s) => ({ ...EMPTY_CUSTOMER, payment: s.payment }));
    setLookup(null);
    setFresh(null);
    setAllOptom(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F1") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9" && !dialogOpen) {
        e.preventDefault();
        submit({ type: "store" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const panel = (
    <CustomerPanel
      state={customerState}
      onChange={(patch) => setCustomerState((s) => ({ ...s, ...patch }))}
      customer={customer}
      phoneInvalid={phoneInvalid}
      totals={totals}
      busy={busy}
      disabled={empty || !online}
      onCheckout={() => submit({ type: "store" })}
      onTekpe={() => setTekpeOpen(true)}
    />
  );

  return (
    <div className="waybill grid flex-1 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <section className="flex min-w-0 flex-col lg:border-r lg:border-ink" aria-label={uz.checkout.title}>
        <div className="flex items-center gap-2 border-b border-ink p-2">
          <ProductSearch ref={searchRef} onPick={addProduct} onBarcode={addByBarcode} />
          <button
            type="button"
            role="switch"
            aria-checked={allOptom}
            onClick={() => {
              setAllOptom(!allOptom);
              dispatch({ type: "setAllWholesale", on: !allOptom });
            }}
            className={cn(
              "flex h-11 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-sm font-bold transition-colors duration-150",
              allOptom ? "border-ink bg-ink text-cell" : "border-ink bg-cell hover:bg-paper",
            )}
          >
            <span
              aria-hidden
              className={cn("flex size-4 items-center justify-center rounded-[3px] border", allOptom ? "border-cell bg-cell text-ink" : "border-ink")}
            >
              {allOptom && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="max-sm:hidden">{uz.checkout.allOptom}</span>
            <span className="sm:hidden">{uz.checkout.optom}</span>
          </button>
          <Button variant="outline" size="icon" className="size-11" onClick={() => setCamera(true)} aria-label={uz.common.camera}>
            <Camera aria-hidden />
          </Button>
          <span className="hidden items-center gap-1.5 px-2 text-xs font-semibold whitespace-nowrap text-ok xl:flex">
            <span className="size-2 rounded-full bg-ok" aria-hidden />
            {uz.scanner.ready}
          </span>
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

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <ScanBarcode className="size-14 text-ink-3" strokeWidth={1.25} aria-hidden />
            <p className="text-xl font-bold">{uz.checkout.emptyTitle}</p>
            <p className="text-ink-2">{uz.checkout.emptyHint}</p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[2rem_2.75rem_minmax(0,1fr)_7rem_5rem_8rem_7.5rem_2.5rem] gap-3 border-b border-ink bg-paper px-3 py-1.5 xl:grid">
              <span className="caption">{uz.sheet.no}</span>
              <span />
              <span className="caption">{uz.sheet.product}</span>
              <span className="caption text-right">{uz.sheet.unitPrice}</span>
              <span className="caption">{uz.checkout.optom}</span>
              <span className="caption">{uz.sheet.qty}</span>
              <span className="caption text-right">{uz.sheet.lineTotal}</span>
              <span />
            </div>
            <ol className="flex-1 overflow-y-auto pb-28 lg:pb-0">
              {lines.map((line, i) => {
                const isFresh = fresh?.id === line.id;
                return (
                  <CartRow
                    key={isFresh ? `${line.id}-${fresh.n}` : line.id}
                    line={line}
                    index={i}
                    fresh={isFresh}
                    dispatch={dispatch}
                  />
                );
              })}
            </ol>
          </>
        )}
      </section>

      <aside className="hidden lg:block">{panel}</aside>

      {/* Phone/tablet: sticky total strip above the bottom nav opens the panel as a sheet. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-ink bg-cell px-3 py-2 md:bottom-0 lg:hidden">
        <div className="min-w-0 flex-1">
          <span className="caption">
            {uz.checkout.total} · {totals.itemCount} {uz.common.pcs}
          </span>
          <p className="monument text-2xl">{formatKrw(totals.subtotal)}</p>
        </div>
        <Button size="lg" onClick={() => setSheetOpen(true)} disabled={empty}>
          {uz.checkout.continue}
        </Button>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto border-t border-ink p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="border-b border-ink px-4 py-3">
            <SheetTitle>{uz.checkout.title}</SheetTitle>
            <SheetDescription className="sr-only">{uz.checkout.payment}</SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>

      <TekpeDialog
        open={tekpeOpen}
        onOpenChange={setTekpeOpen}
        state={customerState}
        onChange={(patch) => setCustomerState((s) => ({ ...s, ...patch }))}
        totals={totals}
        rates={rates}
        busy={busy}
        offline={!online}
        onConfirm={(destination) => submit({ type: "tekpe", destination })}
      />
      <SuccessDialog order={success} onNewOrder={newOrder} />
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={addByBarcode} continuous />
    </div>
  );
}
