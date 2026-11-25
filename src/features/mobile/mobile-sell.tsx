"use client";

import { useState } from "react";
import { Check, CheckCircle2, Minus, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { scanFeedback } from "@/components/scanner/feedback";
import { useHidScanner } from "@/components/scanner/use-hid-scanner";
import { useOnline } from "@/components/shell/use-online";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { ProductSearch } from "@/features/checkout/product-search";
import { cartFingerprint, resolveRequest, type Payload } from "@/features/checkout/request-key";
import { useCart } from "@/features/checkout/use-cart";
import type { Order, Product } from "@/lib/database.types";
import { findProductByBarcode } from "@/lib/data/products";
import { isOverStock, unitPrice } from "@/lib/domain/cart";
import { errorMessage } from "@/lib/domain/errors";
import { formatKrw } from "@/lib/domain/money";
import { isNetworkError, REQUEST_TIMEOUT_MS } from "@/lib/domain/network";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import type { PaymentMethod } from "@/lib/domain/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const MOBILE_CART = { cart: "guli.mobile.cart", request: "guli.mobile.request" };
// Nasiya needs a customer's phone and name; the phone app keeps to the three quick ones.
const PAYMENTS: PaymentMethod[] = ["cash", "card", "transfer"];

function toCartProduct(p: Product) {
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

export function MobileSell() {
  const { lines, dispatch, totals, loadRequest, saveRequest, finishOrder } = useCart(MOBILE_CART);
  const online = useOnline();
  // Like a hand scanner: one press of Skanerlash reads one barcode, then the camera closes.
  const [camera, setCamera] = useState(false);
  // Hammasi optom, as in Kassa: every line (and every new scan) at the wholesale price.
  const [allOptom, setAllOptom] = useState(() => lines.length > 0 && lines.every((l) => l.isWholesale));
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [sold, setSold] = useState<Order | null>(null);
  const empty = lines.length === 0;

  function add(p: Product) {
    dispatch({ type: "add", product: toCartProduct(p), wholesale: allOptom });
    toast.success(p.name, { duration: 1500 });
  }

  async function addByBarcode(code: string) {
    try {
      const product = await findProductByBarcode(supabaseBrowser(), code);
      scanFeedback(Boolean(product));
      if (product) add(product);
      else toast.error(`${uz.mobile.notFound}: ${code}`);
    } catch (e) {
      scanFeedback(false);
      toast.error(errorMessage(e));
    }
  }

  useHidScanner((code) => {
    if (sold) setSold(null);
    addByBarcode(code);
  });

  async function sell() {
    if (empty || busy) return;
    if (!online) return void toast.error(uz.mobile.offline);
    setBusy(true);
    const sb = supabaseBrowser();
    const payload: Payload = {
      items: lines.map((l) => ({ product_id: l.id, qty: l.qty, is_wholesale: l.isWholesale })),
      type: "store",
      destination: null,
      phone: null,
      name: null,
      payment,
    };
    const fp = cartFingerprint(payload);
    try {
      // Same safety as Kassa: a retry after a lost answer never makes a second order.
      const decision = await resolveRequest(
        loadRequest(),
        fp,
        async (requestId) => {
          const { data, error } = await sb.from("orders").select("*").eq("request_id", requestId).maybeSingle();
          if (error) throw error;
          return data;
        },
        () => crypto.randomUUID(),
      );
      if (decision.kind === "placed") {
        saveRequest(null);
        setSold(decision.order);
        return;
      }
      saveRequest({ id: decision.id, fp });
      const { data, error } = await sb
        .rpc("create_order", {
          p_request_id: decision.id,
          p_items: payload.items,
          p_customer_phone: null,
          p_customer_name: null,
          p_payment_method: payment,
          p_type: "store",
          p_destination: null,
        })
        .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
      if (error) throw error;
      finishOrder();
      scanFeedback(true);
      setSold(data);
    } catch (e) {
      toast.error(isNetworkError(e) ? uz.mobile.offline : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (sold) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="size-24 text-ok" strokeWidth={1.5} aria-hidden />
        <p className="text-4xl font-extrabold">{uz.mobile.sold}</p>
        <p className="monument text-5xl">{formatOrderTotal(sold)}</p>
        <p className="text-ink-2">
          {formatOrderNo(sold.order_no)} · {uz.payment[sold.payment_method]}
        </p>
        <Button
          className="mt-6 h-16 w-full max-w-sm text-xl"
          onClick={() => {
            setSold(null);
            setAllOptom(false);
            setCamera(true);
          }}
        >
          <ScanBarcode className="size-6" aria-hidden />
          {uz.mobile.nextSale}
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-ink p-2">
        <div className="min-w-0 flex-1">
          <ProductSearch onPick={add} onBarcode={addByBarcode} />
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={allOptom}
          onClick={() => {
            setAllOptom(!allOptom);
            dispatch({ type: "setAllWholesale", on: !allOptom });
          }}
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 rounded-md border-2 border-ink px-3 text-base font-bold",
            allOptom ? "bg-ink text-cell" : "bg-cell",
          )}
        >
          <span
            aria-hidden
            className={cn("flex size-5 items-center justify-center rounded-[3px] border-2", allOptom ? "border-cell bg-cell text-ink" : "border-ink")}
          >
            {allOptom && <Check className="size-3.5" strokeWidth={3} />}
          </span>
          {uz.checkout.allOptom}
        </button>
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <ScanBarcode className="size-16 text-ink-3" strokeWidth={1.25} aria-hidden />
          <p className="text-2xl font-bold">{uz.mobile.emptyCart}</p>
          <p className="text-ink-2">{uz.mobile.emptyCartHint}</p>
        </div>
      ) : (
        <ol className="flex-1 divide-y divide-rule-soft pb-64">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-3">
              <ProductThumb path={l.photoPath} size={56} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold leading-snug">{l.name}</p>
                <p className="num text-sm text-ink-2">
                  {formatKrw(unitPrice(l))}
                  {l.isWholesale && <span className="ml-1.5 rounded-sm bg-ink px-1 py-px text-[11px] font-bold text-cell">{uz.checkout.optom}</span>}
                </p>
                {isOverStock(l) && <p className="text-xs font-bold text-danger">{uz.mobile.stockLeft(l.stock)}</p>}
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={l.qty === 1 ? uz.mobile.remove : "−"}
                  onClick={() => dispatch(l.qty === 1 ? { type: "remove", id: l.id } : { type: "dec", id: l.id })}
                  className="flex size-12 items-center justify-center rounded-l-md border border-ink active:bg-paper"
                >
                  {l.qty === 1 ? <Trash2 className="size-5 text-danger" aria-hidden /> : <Minus className="size-5" aria-hidden />}
                </button>
                <span className="num flex h-12 w-12 items-center justify-center border-y border-ink text-xl font-bold">{l.qty}</span>
                <button
                  type="button"
                  aria-label="+"
                  onClick={() => dispatch({ type: "inc", id: l.id })}
                  className="flex size-12 items-center justify-center rounded-r-md border border-ink active:bg-paper"
                >
                  <Plus className="size-5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 grid gap-2 border-t-2 border-ink bg-cell p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {!empty && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-semibold">
                {uz.mobile.total} · {totals.itemCount} {uz.common.pcs}
              </span>
              <span className="monument text-3xl">{formatKrw(totals.subtotal)}</span>
            </div>
            <div role="radiogroup" aria-label={uz.mobile.pay} className="grid grid-cols-3 overflow-hidden rounded-md border border-ink">
              {PAYMENTS.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={payment === m}
                  onClick={() => setPayment(m)}
                  className={cn("h-12 text-base font-bold", i > 0 && "border-l border-ink", payment === m ? "bg-ink text-cell" : "bg-cell")}
                >
                  {uz.payment[m]}
                </button>
              ))}
            </div>
          </>
        )}
        <div className={cn("grid gap-2", empty ? "grid-cols-1" : "grid-cols-2")}>
          <Button variant="outline" className="h-16 text-lg" onClick={() => setCamera(true)}>
            <ScanBarcode className="size-6" aria-hidden />
            {empty ? uz.mobile.scan : uz.mobile.scanAgain}
          </Button>
          {!empty && (
            <Button className="h-16 text-xl" onClick={sell} disabled={busy}>
              {uz.mobile.sellNow}
            </Button>
          )}
        </div>
      </div>

      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={addByBarcode} />
    </main>
  );
}
