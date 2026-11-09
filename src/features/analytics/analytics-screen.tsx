"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeastSold, getReport, type LeastSoldRow, type Report } from "@/lib/data/analytics";
import { errorMessage } from "@/lib/domain/errors";
import { periodLabel, periodRange, seoulToday, shiftPeriod, type PeriodKind } from "@/lib/domain/period";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { KpiStrip } from "./kpi-strip";
import { ProductTable } from "./product-table";
import { BestSellers, LeastSold } from "./ranking-lists";
import { resolveScope, ScopeSelect } from "./scope-select";

const KINDS: PeriodKind[] = ["day", "week", "month", "year"];

export function AnalyticsScreen({ isManager, meId }: { isManager: boolean; meId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const today = seoulToday();
  const kind = (KINDS.includes(sp.get("p") as PeriodKind) ? sp.get("p") : "day") as PeriodKind;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("d") ?? "") ? sp.get("d")! : today;
  const { scope: scopeParam, sellerId } = resolveScope(isManager, meId, sp.get("s"));

  const range = periodRange(kind, anchor);
  const key = `${range.from}|${range.to}|${sellerId}`;
  const [report, setReport] = useState<{ key: string; data: Report } | null>(null);
  const [leastDays, setLeastDays] = useState<14 | 30>(14);
  const [least, setLeast] = useState<{ key: string; rows: LeastSoldRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReport(supabaseBrowser(), range.from, range.to, sellerId)
      .then((data) => !cancelled && setReport({ key, data }))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key, range.from, range.to, sellerId]);

  const leastKey = `${leastDays}|${sellerId}`;
  useEffect(() => {
    let cancelled = false;
    getLeastSold(supabaseBrowser(), leastDays, sellerId)
      .then((rows) => !cancelled && setLeast({ key: leastKey, rows }))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [leastKey, leastDays, sellerId]);

  function go(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const current = report?.key === key ? report.data : null;
  const atToday = range.endYmd >= today;

  return (
    <>
      <PageHeader title={uz.analytics.title}>
        <ScopeSelect isManager={isManager} meId={meId} value={scopeParam} onChange={(v) => go({ s: v || undefined })} />
      </PageHeader>

      <div className="waybill mb-4 flex flex-wrap items-stretch">
        <div role="radiogroup" aria-label={uz.analytics.title} className="flex border-ink max-sm:w-full max-sm:border-b sm:border-r">
          {KINDS.map((k, i) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => go({ p: k, d: anchor })}
              className={cn(
                "h-11 flex-1 px-4 text-sm font-semibold transition-colors duration-150 sm:flex-none",
                i > 0 && "border-l border-ink",
                kind === k ? "bg-ink text-cell" : "hover:bg-paper",
              )}
            >
              {uz.analytics.periods[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-1 px-2 py-1">
          <Button variant="ghost" size="icon" onClick={() => go({ d: shiftPeriod(kind, anchor, -1) })} aria-label={uz.analytics.prev}>
            <ChevronLeft aria-hidden />
          </Button>
          <p className="num min-w-40 flex-1 text-center text-base font-bold" aria-live="polite">
            {periodLabel(kind, anchor)}
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => go({ d: shiftPeriod(kind, anchor, 1) })}
            disabled={atToday}
            aria-label={uz.analytics.next}
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={() => go({ d: undefined })} disabled={anchor === today}>
            {uz.analytics.today}
          </Button>
        </div>
      </div>

      {current === null ? (
        <Skeleton className="mb-4 h-56 rounded-lg border border-ink" />
      ) : (
        <KpiStrip report={current} />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {current === null ? (
          <Skeleton className="h-72 rounded-lg border border-ink" />
        ) : current.products.length === 0 ? (
          <div className="waybill px-4 py-12 text-center text-ink-2">{uz.analytics.empty}</div>
        ) : (
          <ProductTable products={current.products} showCost={current.cost !== null} />
        )}
        <div className="grid content-start gap-4">
          <BestSellers products={current?.products ?? []} />
          <LeastSold rows={least?.key === leastKey ? least.rows : null} days={leastDays} onDays={setLeastDays} />
        </div>
      </div>
    </>
  );
}
