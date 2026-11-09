"use client";

import { useMemo, useState } from "react";
import { Krw, Weight } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import type { ReportProduct } from "@/lib/data/analytics";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

type Sort = "revenue" | "qty" | "profit";

const profit = (p: ReportProduct) => p.revenue - (p.cost ?? 0);

export function ProductTable({ products, showCost }: { products: ReportProduct[]; showCost: boolean }) {
  const [sort, setSort] = useState<Sort>("revenue");
  const sorts: Sort[] = showCost ? ["revenue", "qty", "profit"] : ["revenue", "qty"];
  const rows = useMemo(
    () =>
      [...products].sort((a, b) =>
        sort === "qty" ? b.qty - a.qty : sort === "profit" ? profit(b) - profit(a) : b.revenue - a.revenue,
      ),
    [products, sort],
  );
  const total = rows.reduce(
    (t, p) => ({ qty: t.qty + p.qty, revenue: t.revenue + p.revenue, cost: t.cost + (p.cost ?? 0), weight: t.weight + p.unit_weight_g * p.qty }),
    { qty: 0, revenue: 0, cost: 0, weight: 0 },
  );

  return (
    <section className="waybill min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink px-3 py-2">
        <h2 className="text-base font-bold">{uz.analytics.products}</h2>
        <div role="radiogroup" aria-label={uz.analytics.sortBy} className="flex overflow-hidden rounded-sm border border-ink text-xs font-semibold">
          {sorts.map((s, i) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sort === s}
              onClick={() => setSort(s)}
              className={cn("px-2.5 py-1.5", i > 0 && "border-l border-ink", sort === s ? "bg-ink text-cell" : "hover:bg-paper")}
            >
              {s === "revenue" ? uz.analytics.sortRevenue : s === "qty" ? uz.analytics.sortQty : uz.analytics.sortProfit}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className={cn("hidden w-full text-sm md:table", showCost ? "min-w-[760px]" : "min-w-[600px]")}>
          <thead className="border-b border-ink bg-paper text-left">
            <tr>
              <th className="w-14 px-3 py-2"><span className="sr-only">{uz.sheet.photo}</span></th>
              <th className="caption px-3 py-2">{uz.sheet.product}</th>
              <th className="caption px-3 py-2 text-right">{uz.analytics.avgPrice}</th>
              <th className="caption px-3 py-2 text-right">{uz.analytics.qty}</th>
              <th className="caption px-3 py-2 text-right">{uz.analytics.revenue}</th>
              <th className="caption px-3 py-2 text-right">{uz.analytics.weight}</th>
              <th className="caption px-3 py-2 text-right">{uz.analytics.totalWeight}</th>
              {showCost && (
                <>
                  <th className="caption px-3 py-2 text-right">{uz.analytics.cost}</th>
                  <th className="caption px-3 py-2 text-right">{uz.analytics.profit}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.product_id} className="border-b border-rule-soft">
                <td className="px-3 py-2"><ProductThumb path={p.photo_path} size={36} /></td>
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2 text-right"><Krw value={Math.round(p.revenue / Math.max(p.qty, 1))} /></td>
                <td className="num px-3 py-2 text-right font-bold">{p.qty}</td>
                <td className="px-3 py-2 text-right font-semibold"><Krw value={p.revenue} /></td>
                <td className="px-3 py-2 text-right text-ink-2"><Weight grams={p.unit_weight_g} /></td>
                <td className="px-3 py-2 text-right text-ink-2"><Weight grams={p.unit_weight_g * p.qty} /></td>
                {showCost && (
                  <>
                    <td className="px-3 py-2 text-right text-ink-2"><Krw value={p.cost ?? 0} /></td>
                    <td className={cn("px-3 py-2 text-right font-bold", profit(p) >= 0 ? "text-ok" : "text-danger")}>
                      <Krw value={profit(p)} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-ink bg-paper font-bold">
            <tr>
              <td />
              <td className="px-3 py-2 uppercase">{uz.analytics.total}</td>
              <td />
              <td className="num px-3 py-2 text-right">{total.qty}</td>
              <td className="px-3 py-2 text-right"><Krw value={total.revenue} /></td>
              <td />
              <td className="px-3 py-2 text-right"><Weight grams={total.weight} /></td>
              {showCost && (
                <>
                  <td className="px-3 py-2 text-right"><Krw value={total.cost} /></td>
                  <td className="px-3 py-2 text-right"><Krw value={total.revenue - total.cost} /></td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="md:hidden">
        {rows.map((p) => (
          <li key={p.product_id} className="grid gap-2 border-b border-rule-soft p-3">
            <div className="flex items-center gap-3">
              <ProductThumb path={p.photo_path} size={40} />
              <span className="min-w-0 flex-1 font-semibold">{p.name}</span>
              <span className="num text-lg font-bold">×{p.qty}</span>
            </div>
            <dl className={cn("grid rounded-sm border border-rule-soft text-sm", showCost ? "grid-cols-3" : "grid-cols-1")}>
              <div className="px-2 py-1.5">
                <dt className="caption">{uz.analytics.revenue}</dt>
                <dd className="font-semibold"><Krw value={p.revenue} /></dd>
              </div>
              {showCost && (
                <>
                  <div className="border-l border-rule-soft px-2 py-1.5">
                    <dt className="caption">{uz.analytics.cost}</dt>
                    <dd className="text-ink-2"><Krw value={p.cost ?? 0} /></dd>
                  </div>
                  <div className="border-l border-rule-soft px-2 py-1.5">
                    <dt className="caption">{uz.analytics.profit}</dt>
                    <dd className={cn("font-bold", profit(p) >= 0 ? "text-ok" : "text-danger")}><Krw value={profit(p)} /></dd>
                  </div>
                </>
              )}
            </dl>
          </li>
        ))}
        <li className="flex justify-between bg-paper px-3 py-2 text-sm font-bold">
          <span className="uppercase">{uz.analytics.total}</span>
          <span className="num">
            ×{total.qty} · <Krw value={total.revenue} />
          </span>
        </li>
      </ul>
    </section>
  );
}
