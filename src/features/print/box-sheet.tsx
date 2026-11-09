import type { BoxForSheet } from "@/lib/data/boxes";
import { formatDateTime } from "@/lib/domain/dates";
import { formatKg, formatKrw, formatUsd } from "@/lib/domain/money";
import { formatBoxNo, formatOrderNo } from "@/lib/domain/order-no";
import { formatPhone } from "@/lib/domain/phone";
import { uz } from "@/lib/i18n/uz";

// Closed boxes carry their totals; an open box is summed from its orders.
function sheetTotals(box: BoxForSheet) {
  if (box.status !== "open") return { orders: box.order_count, items: box.item_count, weightG: box.total_weight_g };
  return {
    orders: box.orders.length,
    items: box.orders.reduce((n, o) => n + o.item_count, 0),
    weightG: box.orders.reduce((n, o) => n + o.total_weight_g, 0),
  };
}

// One A4 per box: whose package is whose, for the seller who receives the box. No cost or profit.
export function BoxSheet({ box }: { box: BoxForSheet }) {
  const totals = sheetTotals(box);
  const shipping =
    box.status === "open" ? "—" : box.destination === "UZ" ? `${box.shipping_kg} kg · ${formatUsd(box.shipping_usd)}` : formatKrw(box.shipping_krw);

  return (
    <article className="sheet relative mx-auto bg-white text-black">
      <header className="grid grid-cols-[auto_1fr_auto] items-center border border-black">
        <div className="flex h-20 items-center border-r border-black px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/guli.png" alt="Guli cosmetics" className="sheet-logo h-12 w-auto object-contain" />
        </div>
        <p className="px-4 text-xl font-bold">{uz.sheet.boxTitle}</p>
        <p className="monument flex h-20 items-center border-l border-black px-5 text-[2.75rem] leading-none">{formatBoxNo(box.box_no)}</p>
      </header>

      <section className="grid grid-cols-3 border-x border-b border-black">
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.seller}</p>
          <p className="font-semibold">{box.seller?.full_name || box.seller?.username || "—"}</p>
        </div>
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.country}</p>
          <p className="font-semibold">{uz.destination[box.destination]}</p>
        </div>
        <div className="px-3 py-2">
          <p className="sheet-caption">{box.closed_at ? uz.sheet.closed : uz.sheet.date}</p>
          <p className="num font-semibold">{formatDateTime(box.closed_at ?? box.created_at)}</p>
        </div>
      </section>
      {box.status === "open" && <p className="border-x border-b border-black px-3 py-1.5 text-sm font-semibold">{uz.sheet.openBoxNote}</p>}

      <table className="mt-4 w-full border-collapse text-[0.82rem]">
        <thead>
          <tr className="border border-black">
            <th className="sheet-caption w-8 px-2 py-1.5 text-left">{uz.sheet.no}</th>
            <th className="sheet-caption px-2 py-1.5 text-left">{uz.sheet.client}</th>
            <th className="sheet-caption px-2 py-1.5 text-left">{uz.sheet.phone}</th>
            <th className="sheet-caption px-2 py-1.5 text-left">{uz.sheet.address}</th>
            <th className="sheet-caption w-14 px-2 py-1.5 text-right">{uz.sheet.qty}</th>
            <th className="sheet-caption w-24 px-2 py-1.5 text-right">{uz.sheet.order}</th>
          </tr>
        </thead>
        {box.orders.map((o, i) => (
          <tbody key={o.id} className="break-inside-avoid border-x border-b border-black">
            <tr>
              <td className="num px-2 pt-1.5 align-top font-bold">{i + 1}</td>
              <td className="px-2 pt-1.5 align-top text-[0.95rem] font-bold">{o.customer?.name || "—"}</td>
              <td className="num px-2 pt-1.5 align-top whitespace-nowrap">{o.customer ? formatPhone(o.customer.phone) : "—"}</td>
              <td className="px-2 pt-1.5 align-top font-semibold">{[o.ship_city, o.ship_district].filter(Boolean).join(", ") || "—"}</td>
              <td className="num px-2 pt-1.5 text-right align-top text-[0.95rem] font-bold">{o.item_count}</td>
              <td className="num px-2 pt-1.5 text-right align-top">{formatOrderNo(o.order_no)}</td>
            </tr>
            <tr>
              <td />
              <td colSpan={5} className="px-2 pt-0.5 pb-1.5 text-[0.78rem]">
                {o.items.map((it) => `${it.name} × ${it.qty}`).join(" · ")}
              </td>
            </tr>
          </tbody>
        ))}
      </table>

      <footer className="sheet-summary mt-4 grid grid-cols-4 border border-black">
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.clients}</p>
          <p className="num text-lg font-bold">{totals.orders}</p>
        </div>
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.itemsLabel}</p>
          <p className="num text-lg font-bold">{totals.items}</p>
        </div>
        <div className="border-r border-black px-3 py-2">
          <p className="sheet-caption">{uz.sheet.totalWeight}</p>
          <p className="num text-lg font-bold">{formatKg(totals.weightG)}</p>
        </div>
        <div className="px-3 py-2">
          <p className="sheet-caption">{uz.sheet.shipping}</p>
          <p className="num text-lg font-bold">{shipping}</p>
        </div>
      </footer>
    </article>
  );
}
