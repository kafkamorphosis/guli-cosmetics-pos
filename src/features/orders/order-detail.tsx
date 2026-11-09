"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Loader2, Pencil, Printer } from "lucide-react";
import { toast } from "sonner";
import { Krw, Weight } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApproveActions } from "@/features/orders/approve-actions";
import { CreditPanel } from "@/features/orders/credit-panel";
import { OrderEditDialog } from "@/features/orders/order-edit-dialog";
import { printOrder } from "@/features/print/print-order";
import type { OrderWithItems } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatKg, formatKrw, formatUsd } from "@/lib/domain/money";
import { formatBoxNo, formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import { orderTypeLabel } from "@/lib/i18n/labels";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`cell ${className ?? ""}`}>
      <span className="caption">{label}</span>
      <div className="mt-0.5 font-semibold">{children}</div>
    </div>
  );
}

export function OrderDetail({ order }: { order: OrderWithItems }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    setCancelling(true);
    const { error } = await supabaseBrowser().rpc("cancel_order", { p_order_id: order.id });
    setCancelling(false);
    setConfirming(false);
    if (error) toast.error(errorMessage(error));
    else toast.success(uz.orders.cancelled);
    router.refresh();
  }

  const timeline = [
    { at: order.created_at, text: uz.orders.createdBy(order.seller?.full_name ?? "—") },
    order.approved_at && { at: order.approved_at, text: uz.orders.approvedBy(order.approvedBy?.full_name ?? "—") },
    order.ready_at && { at: order.ready_at, text: uz.orders.readyBy(order.readyBy?.full_name ?? "—") },
    order.picked_up_at && { at: order.picked_up_at, text: uz.orders.pickedBy(order.pickedUpBy?.full_name ?? "—") },
    order.cancelled_at && { at: order.cancelled_at, text: uz.orders.cancelledBy(order.cancelledBy?.full_name ?? "—") },
  ].filter(Boolean) as { at: string; text: string }[];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/buyurtmalar">
            <ArrowLeft aria-hidden />
            {uz.orders.back}
          </Link>
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {order.status !== "cancelled" && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {uz.common.edit}
            </Button>
          )}
          {order.status === "pending" && <ApproveActions order={order} onDone={() => router.refresh()} size="default" />}
          {order.status !== "cancelled" && order.status !== "pending" && (!order.box || order.box.status === "open") && (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              <Ban aria-hidden />
              {uz.orders.cancel}
            </Button>
          )}
          {/* Boxed seller orders print on their box list. */}
          {order.status !== "pending" && !order.box_id && (
            <Button onClick={() => printOrder(order.id)}>
              <Printer aria-hidden />
              {uz.common.print}
            </Button>
          )}
        </div>
      </div>

      <div className="waybill">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink px-4 py-3">
          <h1 className="monument text-[3rem] leading-none">{formatOrderNo(order.order_no)}</h1>
          <StatusBadge status={order.status} />
          <p className="monument ml-auto text-3xl">{formatOrderTotal(order)}</p>
        </div>

        <div className="grid grid-cols-2 border-b border-ink md:grid-cols-5 [&>*]:border-rule-soft [&>*:not(:last-child)]:border-r max-md:[&>*:nth-child(2n)]:border-r-0 max-md:[&>*:nth-child(-n+4)]:border-b">
          <Field label={uz.orders.date}>
            <span className="num">{formatDateTime(order.created_at)}</span>
          </Field>
          <Field label={uz.orders.customer}>
            {order.customer?.name || "—"}
            {order.customer && <span className="num block text-sm font-normal text-ink-2">{formatPhone(order.customer.phone)}</span>}
          </Field>
          <Field label={uz.orders.type}>{orderTypeLabel(order)}</Field>
          <Field label={uz.orders.payment}>{uz.payment[order.payment_method]}</Field>
          <Field label={uz.orders.seller}>{order.seller?.full_name ?? "—"}</Field>
          {(order.ship_city || order.box) && (
            <Field label={uz.seller.address} className="col-span-2 md:col-span-5 border-t border-rule-soft">
              {[order.ship_city, order.ship_district].filter(Boolean).join(", ") || "—"}
              {order.box && (
                <span className="num ml-2 font-normal text-ink-2">
                  · {uz.seller.box} {formatBoxNo(order.box.box_no)} ({uz.tekpe.boxStatus[order.box.status]})
                </span>
              )}
            </Field>
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-ink bg-paper text-left">
              <tr>
                <th className="caption w-10 px-3 py-2">{uz.sheet.no}</th>
                <th className="w-14 px-2 py-2">
                  <span className="sr-only">{uz.sheet.photo}</span>
                </th>
                <th className="caption px-3 py-2">{uz.sheet.product}</th>
                <th className="caption px-3 py-2 text-right">{uz.sheet.unitPrice}</th>
                <th className="caption px-3 py-2 text-right">{uz.sheet.qty}</th>
                <th className="caption px-3 py-2 text-right">{uz.sheet.lineTotal}</th>
                <th className="caption px-3 py-2 text-right">{uz.sheet.unitWeight}</th>
                <th className="caption px-3 py-2 text-right">{uz.sheet.lineWeight}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={item.id} className="border-b border-rule-soft">
                  <td className="num px-3 py-2 text-ink-3">{i + 1}</td>
                  <td className="px-2 py-2">
                    <ProductThumb path={item.photo_path} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{item.name}</span>
                    {item.is_wholesale && (
                      <span className="ml-2 rounded-sm bg-ink px-1.5 py-0.5 text-caption font-bold text-cell uppercase">{uz.checkout.optom}</span>
                    )}
                    <span className="num block text-xs tracking-wider text-ink-3">{item.barcode}</span>
                  </td>
                  <td className="px-3 py-2 text-right"><Krw value={item.unit_price} /></td>
                  <td className="num px-3 py-2 text-right font-bold">{item.qty}</td>
                  <td className="px-3 py-2 text-right font-bold"><Krw value={item.line_total} /></td>
                  <td className="px-3 py-2 text-right text-ink-2"><Weight grams={item.unit_weight_g} /></td>
                  <td className="px-3 py-2 text-right text-ink-2"><Weight grams={item.line_weight_g} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phones: one stacked row per item instead of a table that scrolls sideways. */}
        <ul className="border-b border-ink md:hidden">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b border-rule-soft px-3 py-2.5 last:border-0">
              <ProductThumb path={item.photo_path} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {item.name}
                  {item.is_wholesale && (
                    <span className="ml-2 rounded-sm bg-ink px-1.5 py-0.5 text-caption font-bold text-cell uppercase">{uz.checkout.optom}</span>
                  )}
                </span>
                <span className="num block text-xs text-ink-3">
                  {formatKrw(item.unit_price)} × {item.qty} · <Weight grams={item.line_weight_g} />
                </span>
              </span>
              <Krw value={item.line_total} className="font-bold" />
            </li>
          ))}
        </ul>

        {order.payment_method === "credit" && <CreditPanel order={order} />}

        <div className="grid md:grid-cols-[1fr_22rem]">
          <section className="cell border-b border-ink md:border-r md:border-b-0">
            <h2 className="caption mb-2">{uz.orders.timeline}</h2>
            <ol className="grid gap-1.5">
              {timeline.map((t) => (
                <li key={t.at + t.text} className="flex gap-3 text-sm">
                  <span className="num w-32 shrink-0 text-ink-3">{formatDateTime(t.at)}</span>
                  <span className="font-medium">{t.text}</span>
                </li>
              ))}
            </ol>
          </section>
          <dl className="text-sm">
            <div className="flex justify-between border-b border-rule-soft px-3 py-2">
              <dt>{uz.sheet.itemsLabel}</dt>
              <dd className="num font-semibold">{uz.sheet.items(order.item_count, order.line_count)}</dd>
            </div>
            <div className="flex justify-between border-b border-rule-soft px-3 py-2">
              <dt>{uz.sheet.totalWeight}</dt>
              <dd className="num font-semibold">{formatKg(order.total_weight_g)}</dd>
            </div>
            <div className="flex justify-between border-b border-rule-soft px-3 py-2">
              <dt>{uz.sheet.subtotal}</dt>
              <dd className="num font-semibold">{formatKrw(order.subtotal)}</dd>
            </div>
            {order.type === "tekpe" && (
              <div className="flex justify-between border-b border-rule-soft px-3 py-2">
                <dt>{uz.sheet.shipping}</dt>
                <dd className="num font-semibold">
                  {order.destination === "UZ" ? `${order.shipping_kg} kg · ${formatUsd(Number(order.shipping_usd))}` : formatKrw(order.shipping_krw)}
                </dd>
              </div>
            )}
            <div className="flex items-baseline justify-between px-3 py-2.5">
              <dt className="font-bold uppercase">{uz.sheet.total}</dt>
              <dd className="monument text-2xl">{formatOrderTotal(order)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <OrderEditDialog order={order} open={editing} onClose={() => setEditing(false)} onSaved={() => router.refresh()} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {uz.orders.cancelConfirmTitle} {formatOrderNo(order.order_no)}
            </AlertDialogTitle>
            <AlertDialogDescription>{uz.orders.cancelConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.orders.keep}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancel();
              }}
              disabled={cancelling}
              className="border-danger bg-danger text-cell hover:bg-danger/90"
            >
              {cancelling && <Loader2 className="animate-spin" aria-hidden />}
              {uz.orders.cancel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
