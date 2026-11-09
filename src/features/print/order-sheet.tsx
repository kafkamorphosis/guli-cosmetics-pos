import { photoUrl } from "@/lib/data/storage";
import type { OrderWithItems } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/domain/dates";
import { formatKg, formatKrw, formatUsd, formatWeight } from "@/lib/domain/money";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import { orderTypeLabel } from "@/lib/i18n/labels";
import { uz } from "@/lib/i18n/uz";

// The customer may receive this sheet in their parcel: no cost, profit, seller, or system name.
export function OrderSheet({ order, qrDataUrl }: { order: OrderWithItems; qrDataUrl: string }) {
  const typeLabel = orderTypeLabel(order);

  const shipping =
    order.destination === "UZ"
      ? `${uz.sheet.shippingUz(order.shipping_kg, formatUsd(Number(order.shipping_usd) / Math.max(order.shipping_kg, 1)))} = ${formatUsd(Number(order.shipping_usd))}`
      : order.destination === "KR"
        ? formatKrw(order.shipping_krw)
        : null;

  return (
    <article className="sheet relative mx-auto bg-white text-black">
      {order.status === "cancelled" && (
        <p className="absolute top-40 left-1/2 -translate-x-1/2 -rotate-12 border-4 border-black px-6 py-2 text-4xl font-black tracking-widest opacity-30">
          {uz.sheet.cancelledStamp}
        </p>
      )}

      <header className="grid grid-cols-[1fr_auto] items-center border border-black">
        <div className="flex h-24 items-center justify-center border-r border-black px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/guli.png" alt="Guli cosmetics" className="sheet-logo h-16 w-auto object-contain" />
        </div>
        <div className="flex h-24 items-center px-5">
          <p className="monument text-[2.75rem] leading-none">{formatOrderNo(order.order_no)}</p>
        </div>
      </header>

      <section className="grid grid-cols-[1fr_1fr_1fr_auto] border-x border-b border-black">
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.date}</p>
          <p className="num font-semibold">{formatDateTime(order.created_at)}</p>
        </div>
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.customer}</p>
          <p className="font-semibold">{order.customer?.name || "—"}</p>
          <p className="num text-sm">{order.customer ? formatPhone(order.customer.phone) : ""}</p>
        </div>
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.type}</p>
          <p className="font-semibold">{typeLabel}</p>
          <p className="text-sm">
            {uz.sheet.payment}: {uz.payment[order.payment_method]}
          </p>
        </div>
        <div className="row-span-1 flex flex-col items-center justify-center px-2 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="" width={104} height={104} className="size-[104px]" />
          <p className="num text-[0.65rem] tracking-[0.2em]">{order.qr_token}</p>
        </div>
      </section>

      <table className="mt-4 w-full border-collapse border border-black text-[0.8rem]">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="sheet-caption w-8 border-r border-black px-2 py-1.5">{uz.sheet.no}</th>
            <th className="sheet-caption w-12 border-r border-black px-2 py-1.5">{uz.sheet.photo}</th>
            <th className="sheet-caption border-r border-black px-2 py-1.5">{uz.sheet.product}</th>
            <th className="sheet-caption border-r border-black px-2 py-1.5 text-right">{uz.sheet.unitPrice}</th>
            <th className="sheet-caption border-r border-black px-2 py-1.5 text-right">{uz.sheet.qty}</th>
            <th className="sheet-caption border-r border-black px-2 py-1.5 text-right">{uz.sheet.lineTotal}</th>
            <th className="sheet-caption border-r border-black px-2 py-1.5 text-right">{uz.sheet.unitWeight}</th>
            <th className="sheet-caption px-2 py-1.5 text-right">{uz.sheet.lineWeight}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, i) => {
            const src = photoUrl(item.photo_path);
            return (
              <tr key={item.id} className="border-b border-black/40 last:border-black">
                <td className="num border-r border-black px-2 py-1">{i + 1}</td>
                <td className="border-r border-black px-1.5 py-1">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" width={36} height={36} className="size-9 object-cover grayscale" />
                  ) : (
                    <span className="block size-9" />
                  )}
                </td>
                <td className="border-r border-black px-2 py-1">
                  <span className="font-semibold">{item.name}</span>
                  {item.is_wholesale && <span className="ml-1.5 text-[0.7rem] uppercase">({uz.sheet.optom})</span>}
                </td>
                <td className="num border-r border-black px-2 py-1 text-right whitespace-nowrap">{formatKrw(item.unit_price)}</td>
                <td className="num border-r border-black px-2 py-1 text-right font-semibold">{item.qty}</td>
                <td className="num border-r border-black px-2 py-1 text-right font-semibold whitespace-nowrap">{formatKrw(item.line_total)}</td>
                <td className="num border-r border-black px-2 py-1 text-right whitespace-nowrap">{formatWeight(item.unit_weight_g)}</td>
                <td className="num px-2 py-1 text-right whitespace-nowrap">{formatWeight(item.line_weight_g)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="sheet-summary mt-4 ml-auto grid w-[60%] border border-black text-sm">
        <div className="flex justify-between border-b border-black px-3 py-1.5">
          <span>{uz.sheet.itemsLabel}</span>
          <span className="num font-semibold">{uz.sheet.items(order.item_count, order.line_count)}</span>
        </div>
        <div className="flex justify-between border-b border-black px-3 py-1.5">
          <span>{uz.sheet.totalWeight}</span>
          <span className="num font-semibold">{formatKg(order.total_weight_g)}</span>
        </div>
        <div className="flex justify-between border-b border-black px-3 py-1.5">
          <span>{uz.sheet.subtotal}</span>
          <span className="num font-semibold">{formatKrw(order.subtotal)}</span>
        </div>
        {shipping && (
          <div className="flex justify-between gap-4 border-b border-black px-3 py-1.5">
            <span>{uz.sheet.shipping}</span>
            <span className="num text-right font-semibold">{shipping}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4 px-3 py-2">
          <span className="text-base font-bold uppercase">{uz.sheet.total}</span>
          <span className="monument text-3xl">{formatOrderTotal(order)}</span>
        </div>
      </section>
    </article>
  );
}
