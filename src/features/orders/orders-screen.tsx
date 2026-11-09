"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { listOrders, listSellers, type OrderFilters, type OrderListRow } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import type { OrderStatus, OrderType } from "@/lib/domain/types";
import { orderTypeLabel } from "@/lib/i18n/labels";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

const PAGE_SIZE = 50;
const STATUSES: OrderStatus[] = ["completed", "pending", "new", "ready", "picked_up", "cancelled"];

function readFilters(sp: URLSearchParams): OrderFilters {
  return {
    status: (sp.get("status") as OrderStatus) || undefined,
    type: (sp.get("type") as OrderType) || undefined,
    sellerId: sp.get("seller") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    q: sp.get("q") || undefined,
    page: Number(sp.get("page")) || 1,
  };
}

const selectClass = "h-11 w-full min-w-0 rounded-sm border border-input bg-cell px-2 text-sm font-medium sm:h-10 sm:w-auto";

export function OrdersScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = readFilters(new URLSearchParams(sp.toString()));
  const key = sp.toString();
  const [result, setResult] = useState<{ key: string; rows: OrderListRow[]; total: number } | null>(null);
  const [sellers, setSellers] = useState<{ id: string; full_name: string; username: string }[]>([]);
  const [search, setSearch] = useState(filters.q ?? "");

  useEffect(() => {
    listSellers(supabaseBrowser()).then(setSellers).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    listOrders(supabaseBrowser(), readFilters(new URLSearchParams(key)), PAGE_SIZE)
      .then((r) => !cancelled && setResult({ key, ...r }))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [key]);

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const loading = result?.key !== key;
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const page = filters.page ?? 1;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const anyFilter = Boolean(filters.status || filters.type || filters.sellerId || filters.from || filters.to || filters.q);

  return (
    <>
      <PageHeader title={uz.orders.title} />
      <div className="waybill">
        <form
          className="grid grid-cols-2 gap-2 border-b border-ink p-2 sm:flex sm:flex-wrap sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: search.trim() || undefined });
          }}
        >
          <label className="relative col-span-2 sm:min-w-56 sm:flex-1">
            <span className="sr-only">{uz.common.search}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => search.trim() !== (filters.q ?? "") && update({ q: search.trim() || undefined })}
              placeholder={uz.orders.searchPlaceholder}
              className="pl-9"
            />
          </label>
          <select aria-label={uz.orders.status} className={selectClass} value={filters.status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })}>
            <option value="">{uz.orders.allStatuses}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {uz.status[s]}
              </option>
            ))}
          </select>
          <select aria-label={uz.orders.type} className={selectClass} value={filters.type ?? ""} onChange={(e) => update({ type: e.target.value || undefined })}>
            <option value="">{uz.orders.allTypes}</option>
            <option value="store">{uz.orderType.store}</option>
            <option value="tekpe">{uz.orderType.tekpe}</option>
          </select>
          <select aria-label={uz.orders.seller} className={`${selectClass} col-span-2`} value={filters.sellerId ?? ""} onChange={(e) => update({ seller: e.target.value || undefined })}>
            <option value="">{uz.orders.allSellers}</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.username}
              </option>
            ))}
          </select>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-ink-2 sm:flex-row sm:items-center sm:text-sm sm:font-normal">
            {uz.orders.from}
            <Input type="date" value={filters.from ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} className="num h-11 w-full min-w-0 sm:h-10 sm:w-38" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-ink-2 sm:flex-row sm:items-center sm:text-sm sm:font-normal">
            {uz.orders.to}
            <Input type="date" value={filters.to ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} className="num h-11 w-full min-w-0 sm:h-10 sm:w-38" />
          </label>
          {anyFilter && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                router.replace(pathname);
              }}
            >
              <X aria-hidden />
              {uz.orders.clear}
            </Button>
          )}
        </form>

        {loading && !result ? (
          <div className="grid gap-px">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-ink-2">{anyFilter ? uz.orders.noMatch : uz.orders.empty}</p>
        ) : (
          <div className={loading ? "opacity-60 transition-opacity" : undefined}>
            {/* Guide line: names the span of orders on this page. */}
            <div className="num flex items-center justify-between border-b border-ink bg-paper px-3 py-1.5 text-xs font-semibold text-ink-2">
              <span>
                {formatOrderNo(rows[0].order_no)} – {formatOrderNo(rows[rows.length - 1].order_no)}
              </span>
              <span>{uz.orders.range(first, last, total)}</span>
            </div>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-ink text-left">
                <tr>
                  <th className="caption px-3 py-2">{uz.orders.order}</th>
                  <th className="caption px-3 py-2">{uz.orders.date}</th>
                  <th className="caption px-3 py-2">{uz.orders.customer}</th>
                  <th className="caption hidden px-3 py-2 xl:table-cell">{uz.orders.seller}</th>
                  <th className="caption px-3 py-2">{uz.orders.type}</th>
                  <th className="caption hidden px-3 py-2 lg:table-cell">{uz.orders.payment}</th>
                  <th className="caption px-3 py-2">{uz.orders.status}</th>
                  <th className="caption px-3 py-2 text-right">{uz.orders.total}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="relative border-b border-rule-soft last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5">
                      <Link href={`/buyurtmalar/${o.id}`} className="monument text-lg after:absolute after:inset-0">
                        {formatOrderNo(o.order_no)}
                      </Link>
                    </td>
                    <td className="num px-3 py-2.5 whitespace-nowrap text-ink-2">{formatDateTime(o.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold">{o.customer?.name || "—"}</span>
                      {o.customer && <span className="num block text-xs text-ink-3">{formatPhone(o.customer.phone)}</span>}
                      {o.ship_city && <span className="block text-xs text-ink-3">{[o.ship_city, o.ship_district].filter(Boolean).join(", ")}</span>}
                    </td>
                    <td className="hidden px-3 py-2.5 text-ink-2 xl:table-cell">{o.seller?.full_name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{orderTypeLabel(o)}</td>
                    <td className="hidden px-3 py-2.5 text-ink-2 lg:table-cell">{uz.payment[o.payment_method]}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="num px-3 py-2.5 text-right font-bold whitespace-nowrap">{formatOrderTotal(o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="md:hidden">
              {rows.map((o) => (
                <li key={o.id} className="border-b border-rule-soft last:border-0">
                  <Link href={`/buyurtmalar/${o.id}`} className="grid gap-1 px-3 py-3 active:bg-paper">
                    <span className="flex items-center justify-between gap-2">
                      <span className="monument text-xl">{formatOrderNo(o.order_no)}</span>
                      <StatusBadge status={o.status} />
                    </span>
                    <span className="flex justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">{o.customer?.name || orderTypeLabel(o)}</span>
                      <span className="num font-bold whitespace-nowrap">{formatOrderTotal(o)}</span>
                    </span>
                    <span className="num text-xs text-ink-3">
                      {formatDateTime(o.created_at)} · {orderTypeLabel(o)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 border-t border-ink p-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                  <ChevronLeft aria-hidden />
                  {uz.orders.prev}
                </Button>
                <Button variant="outline" size="sm" disabled={last >= total} onClick={() => update({ page: String(page + 1) })}>
                  {uz.orders.next}
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
