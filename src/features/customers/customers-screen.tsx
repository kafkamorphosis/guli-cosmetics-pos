"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { Krw } from "@/components/money";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveScope, ScopeSelect } from "@/features/analytics/scope-select";
import { listCustomerStats } from "@/lib/data/customers";
import { customersCsv, filterCustomers, sortCustomers, type CustomerRow, type CustomerSort } from "@/lib/domain/customers";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { seoulToday } from "@/lib/domain/period";
import { formatPhone } from "@/lib/domain/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { Spent } from "./spent";

const SORTS: CustomerSort[] = ["recent", "spent", "orders", "name"];

function Cell({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("cell", className)}>
      <span className="caption">{label}</span>
      <div className="mt-1 max-sm:mt-0">{children}</div>
    </div>
  );
}

function download(rows: CustomerRow[]) {
  const url = URL.createObjectURL(new Blob([customersCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `mijozlar-${seoulToday()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CustomersScreen({ isManager, meId }: { isManager: boolean; meId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { scope, sellerId } = resolveScope(isManager, meId, sp.get("s"));
  const sort = (SORTS.includes(sp.get("sort") as CustomerSort) ? sp.get("sort") : "recent") as CustomerSort;
  const [query, setQuery] = useState(sp.get("q") ?? "");
  const [result, setResult] = useState<{ key: string; rows: CustomerRow[] } | null>(null);
  const key = String(sellerId);

  useEffect(() => {
    let cancelled = false;
    listCustomerStats(supabaseBrowser(), sellerId)
      .then((rows) => !cancelled && setResult({ key, rows }))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key, sellerId]);

  function go(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const all = result?.key === key ? result.rows : null;
  const rows = all ? sortCustomers(filterCustomers(all, query), sort) : [];
  const detailHref = (id: string) => `/mijozlar/${id}${isManager && scope ? `?s=${encodeURIComponent(scope)}` : ""}`;

  return (
    <>
      <PageHeader title={uz.customers.title}>
        <ScopeSelect isManager={isManager} meId={meId} value={scope} onChange={(v) => go({ s: v || undefined })} />
        <Button variant="outline" onClick={() => download(rows)} disabled={rows.length === 0}>
          <Download aria-hidden />
          {uz.customers.exportCsv}
        </Button>
      </PageHeader>

      {all === null ? (
        <Skeleton className="mb-4 h-24 rounded-lg border border-ink" />
      ) : (
        // Phones: one row per total (label left, figure right); wider: three columns.
        <div className="waybill mb-4 grid sm:grid-cols-3 [&>*+*]:border-t [&>*+*]:border-ink sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l max-sm:[&>*]:flex max-sm:[&>*]:items-center max-sm:[&>*]:justify-between max-sm:[&>*]:gap-3">
          <Cell label={uz.customers.count}>
            <span className="monument block text-figure max-sm:text-3xl">{all.length}</span>
          </Cell>
          <Cell label={uz.customers.repeat}>
            <span className="monument block text-figure max-sm:text-3xl">{all.filter((c) => c.orders >= 2).length}</span>
          </Cell>
          <Cell label={uz.customers.spentTotal}>
            <Krw value={all.reduce((s, c) => s + c.spent, 0)} className="monument block text-figure max-sm:text-3xl" />
          </Cell>
        </div>
      )}

      <div className="waybill">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink p-2">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">{uz.common.search}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onBlur={() => query.trim() !== (sp.get("q") ?? "") && go({ q: query.trim() || undefined })}
              placeholder={uz.customers.searchPlaceholder}
              className="pl-9"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            {uz.customers.sortBy}
            <select
              value={sort}
              onChange={(e) => go({ sort: e.target.value === "recent" ? undefined : e.target.value })}
              className="h-10 rounded-sm border border-input bg-cell px-2 text-sm font-medium text-ink"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {uz.customers.sort[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {all === null ? (
          <div className="grid gap-px">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-ink-2">{all.length === 0 ? uz.customers.empty : uz.customers.noMatch}</p>
        ) : (
          <>
            <div className="num border-b border-ink bg-paper px-3 py-1.5 text-xs font-semibold text-ink-2">
              {uz.customers.shown(rows.length, all.length)}
            </div>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-ink text-left">
                <tr>
                  <th className="caption px-3 py-2">{uz.customers.client}</th>
                  <th className="caption px-3 py-2 text-right">{uz.customers.orders}</th>
                  <th className="caption hidden px-3 py-2 text-right lg:table-cell">{uz.customers.tekpe}</th>
                  <th className="caption hidden px-3 py-2 text-right lg:table-cell">{uz.customers.items}</th>
                  <th className="caption px-3 py-2 text-right">{uz.customers.spent}</th>
                  <th className="caption px-3 py-2 text-right">{uz.customers.lastOrder}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="relative border-b border-rule-soft last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5">
                      <Link href={detailHref(c.id)} className="block font-semibold after:absolute after:inset-0">
                        {c.name || <span className="text-ink-3">{uz.customers.noName}</span>}
                      </Link>
                      <span className="num block text-xs text-ink-3">{formatPhone(c.phone)}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right font-bold">{c.orders}</td>
                    <td className="num hidden px-3 py-2.5 text-right text-ink-2 lg:table-cell">{c.tekpe_orders}</td>
                    <td className="num hidden px-3 py-2.5 text-right text-ink-2 lg:table-cell">{c.items}</td>
                    <td className="px-3 py-2.5 text-right font-bold">
                      <Spent c={c} />
                    </td>
                    <td className="num px-3 py-2.5 text-right whitespace-nowrap text-ink-2">
                      {c.last_order_at ? formatDateTime(c.last_order_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="md:hidden">
              {rows.map((c) => (
                <li key={c.id} className="border-b border-rule-soft last:border-0">
                  <Link href={detailHref(c.id)} className="grid gap-1 px-3 py-3 active:bg-paper">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{c.name || <span className="text-ink-3">{uz.customers.noName}</span>}</span>
                      <Spent c={c} className="font-bold" />
                    </span>
                    <span className="num flex justify-between gap-2 text-xs text-ink-3">
                      <span>{formatPhone(c.phone)}</span>
                      <span>
                        {uz.analytics.ordersCount(c.orders)} · {c.last_order_at ? formatDateTime(c.last_order_at) : "—"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
