"use client";

import Link from "next/link";
import { ProductThumb } from "@/components/product-thumb";
import type { LeastSoldRow, ReportProduct } from "@/lib/data/analytics";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

function Row({ rank, name, photo, right, sub }: { rank: number; name: string; photo: string | null; right: string; sub?: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-rule-soft px-3 py-2 last:border-0">
      <span className="num w-5 text-right text-sm text-ink-3">{rank}</span>
      <ProductThumb path={photo} size={32} />
      <Link href={`/ombor?q=${encodeURIComponent(name)}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
        {name}
      </Link>
      <span className="text-right">
        <span className="num block text-sm font-bold">{right}</span>
        {sub && <span className="num block text-xs text-ink-3">{sub}</span>}
      </span>
    </li>
  );
}

export function BestSellers({ products }: { products: ReportProduct[] }) {
  const top = [...products].sort((a, b) => b.qty - a.qty).slice(0, 10);
  return (
    <section className="waybill">
      <h2 className="border-b border-ink px-3 py-2 text-base font-bold">{uz.analytics.best}</h2>
      {top.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-2">{uz.analytics.empty}</p>
      ) : (
        <ol>
          {top.map((p, i) => (
            <Row key={p.product_id} rank={i + 1} name={p.name} photo={p.photo_path} right={uz.analytics.sold(p.qty)} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function LeastSold({
  rows,
  days,
  onDays,
}: {
  rows: LeastSoldRow[] | null;
  days: 14 | 30;
  onDays(d: 14 | 30): void;
}) {
  return (
    <section className="waybill">
      <div className="flex items-center justify-between gap-2 border-b border-ink px-3 py-2">
        <h2 className="text-base font-bold">{uz.analytics.least}</h2>
        <div role="radiogroup" aria-label={uz.analytics.least} className="flex overflow-hidden rounded-sm border border-ink text-xs font-semibold">
          {([14, 30] as const).map((d, i) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => onDays(d)}
              className={cn("px-2.5 py-1.5", i > 0 && "border-l border-ink", days === d ? "bg-ink text-cell" : "hover:bg-paper")}
            >
              {uz.analytics.days(d)}
            </button>
          ))}
        </div>
      </div>
      {rows === null ? (
        <p className="px-3 py-6 text-center text-sm text-ink-3">{uz.common.loading}</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-ink-2">{uz.analytics.noProducts}</p>
      ) : (
        <ol>
          {rows.map((r, i) => (
            <Row
              key={r.product_id}
              rank={i + 1}
              name={r.name}
              photo={r.photo_path}
              right={uz.analytics.sold(r.qty_sold)}
              sub={uz.analytics.inStock(r.stock)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
