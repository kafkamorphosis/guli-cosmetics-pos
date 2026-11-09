import { Krw, Usd } from "@/components/money";
import type { Report } from "@/lib/data/analytics";
import { PAYMENT_METHODS } from "@/lib/domain/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";



function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("cell", className)}>
      <span className="caption">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function KpiStrip({ report }: { report: Report }) {
  const pay = new Map(report.by_payment.map((p) => [p.method, p]));
  return (
    <div className="waybill mb-4">
      <div
        className={cn(
          "grid [&>*+*]:border-t [&>*+*]:border-ink sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l",
          report.cost !== null && "sm:grid-cols-3",
        )}
      >
        <Cell label={uz.analytics.revenue}>
          <Krw value={report.revenue} className="monument block text-figure" />
        </Cell>
        {/* Sellers' reports carry no cost or profit. */}
        {report.cost !== null && report.profit !== null && (
          <>
            <Cell label={uz.analytics.cost}>
              <Krw value={report.cost} className="monument block text-figure text-ink-2" />
            </Cell>
            <Cell label={uz.analytics.profit}>
              <Krw value={report.profit} className={cn("monument block text-figure", report.profit >= 0 ? "text-ok" : "text-danger")} />
            </Cell>
          </>
        )}
      </div>
      <div className="grid grid-cols-3 border-t border-ink [&>*+*]:border-l [&>*+*]:border-rule-soft">
        <Cell label={uz.analytics.orders}>
          <span className="num text-xl font-bold">{report.orders}</span>
        </Cell>
        <Cell label={uz.analytics.items}>
          <span className="num text-xl font-bold">{report.items}</span>
        </Cell>
        <Cell label={uz.analytics.shipping}>
          <Krw value={report.shipping_krw} className="block text-base font-bold" />
          <Usd value={report.shipping_usd} className="block text-base font-bold" />
        </Cell>
      </div>
      <div className="grid grid-cols-2 border-t border-ink bg-paper/60 sm:grid-cols-4 [&>*]:border-rule-soft [&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(-n+2)]:border-b sm:[&>*:not(:last-child)]:border-r">
        {PAYMENT_METHODS.map((m) => (
          <Cell key={m} label={uz.payment[m]} className="bg-transparent">
            <Krw value={pay.get(m)?.revenue ?? 0} className="block text-base font-bold" />
            <span className="num text-xs text-ink-3">{uz.analytics.ordersCount(pay.get(m)?.orders ?? 0)}</span>
          </Cell>
        ))}
      </div>
    </div>
  );
}
