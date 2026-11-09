import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Krw, Weight } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { MyOrderWithItems } from "@/lib/data/seller";
import { formatDateTime } from "@/lib/domain/dates";
import { formatKrw } from "@/lib/domain/money";
import { formatBoxNo, formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import { uz } from "@/lib/i18n/uz";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cell">
      <span className="caption">{label}</span>
      <div className="mt-0.5 font-semibold">{children}</div>
    </div>
  );
}

export function MyOrderDetail({ order }: { order: MyOrderWithItems }) {
  const timeline = [
    { at: order.created_at, text: uz.seller.created },
    order.approved_at && { at: order.approved_at, text: uz.seller.approved },
    order.ready_at && { at: order.ready_at, text: uz.seller.ready },
    order.picked_up_at && { at: order.picked_up_at, text: uz.seller.pickedUp },
    order.cancelled_at && { at: order.cancelled_at, text: uz.seller.cancelled },
  ].filter(Boolean) as { at: string; text: string }[];

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/buyurtmalarim">
            <ArrowLeft aria-hidden />
            {uz.seller.back}
          </Link>
        </Button>
      </div>

      <div className="waybill">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink px-4 py-3">
          <h1 className="monument text-[3rem] leading-none">{formatOrderNo(order.order_no)}</h1>
          <StatusBadge status={order.status} />
          <p className="monument ml-auto text-3xl">{formatOrderTotal(order)}</p>
        </div>

        <div className="grid grid-cols-2 border-b border-ink md:grid-cols-4 [&>*]:border-rule-soft [&>*:not(:last-child)]:border-r max-md:[&>*:nth-child(2)]:border-r-0 max-md:[&>*:nth-child(-n+2)]:border-b">
          <Field label={uz.orders.customer}>
            {order.customer?.name || "—"}
            {order.customer && <span className="num block text-sm font-normal text-ink-2">{formatPhone(order.customer.phone)}</span>}
          </Field>
          <Field label={uz.seller.address}>
            {order.destination ? uz.destination[order.destination] : "—"}
            <span className="block text-sm font-normal text-ink-2">{[order.ship_city, order.ship_district].filter(Boolean).join(", ") || "—"}</span>
          </Field>
          <Field label={uz.orders.payment}>
            {uz.payment[order.payment_method]}
            {order.payment_method === "credit" && order.status !== "cancelled" && (
              <span className="num block text-sm font-normal text-ink-2">
                {uz.nasiya.paidAmount}: {formatKrw(order.paid_krw)} · {uz.nasiya.left}: {formatKrw(order.credit_due_krw)}
              </span>
            )}
          </Field>
          <Field label={uz.seller.box}>
            <span className="num">{order.box_no ? formatBoxNo(order.box_no) : "—"}</span>
          </Field>
        </div>

        <h2 className="caption border-b border-ink bg-paper px-3 py-2">{uz.seller.items}</h2>
        <ul>
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b border-rule-soft px-3 py-2.5">
              <ProductThumb path={item.photo_path} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
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

        <ol className="grid gap-1 px-4 py-3 text-sm">
          {timeline.map((t) => (
            <li key={t.text} className="flex gap-3">
              <span className="num w-36 shrink-0 text-ink-3">{formatDateTime(t.at)}</span>
              <span>{t.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
