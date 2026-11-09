"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listMyOrders, type MyOrder } from "@/lib/data/seller";
import { mergeFresh } from "@/lib/domain/paging";
import { errorMessage } from "@/lib/domain/errors";
import { formatBoxNo, formatOrderNo } from "@/lib/domain/order-no";
import { formatPhone } from "@/lib/domain/phone";
import { groupByBox, type BoxGroup } from "@/lib/domain/box-groups";
import type { Destination } from "@/lib/domain/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const PAGE = 50;
const COUNTRIES: Destination[] = ["KR", "UZ"];

function groupTitle(g: BoxGroup<MyOrder>): string {
  if (g.kind === "pending") return uz.status.pending;
  if (g.kind === "other") return uz.status.cancelled;
  const no = g.boxNo ? formatBoxNo(g.boxNo) : "";
  return g.kind === "open" ? uz.seller.openBox(no) : uz.seller.closedBox(no, g.orders[0]?.box_status === "picked_up");
}

const address = (o: MyOrder) => [o.ship_city, o.ship_district].filter(Boolean).join(", ") || "—";
// Sellers have no Realtime access to orders, so the list refreshes on focus and on a timer.
const REFRESH_MS = 30_000;

export function MyOrdersScreen() {
  const [rows, setRows] = useState<MyOrder[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [country, setCountry] = useState<Destination>("KR");
  const loaded = useRef(false);

  // Refreshes only the newest page; older pages the seller loaded stay as they are.
  const load = useCallback(
    () =>
      listMyOrders(supabaseBrowser(), PAGE, 0)
        .then((fresh) => {
          if (!loaded.current) {
            setMore(fresh.length === PAGE);
            if (fresh[0]?.destination) setCountry(fresh[0].destination);
          }
          loaded.current = true;
          setRows((prev) => mergeFresh(prev, fresh));
        })
        .catch((e) => toast.error(errorMessage(e))),
    [],
  );

  async function loadMore() {
    if (!rows || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMyOrders(supabaseBrowser(), PAGE, rows.length);
      setRows((prev) => [...(prev ?? []), ...page.filter((o) => !prev?.some((p) => p.id === o.id))]);
      setMore(page.length === PAGE);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const groups = rows ? groupByBox(rows, country) : [];
  const count = (d: Destination) => rows?.filter((o) => o.destination === d).length ?? 0;

  return (
    <>
      <PageHeader title={uz.seller.myOrdersTitle} />
      <div className="waybill">
        <div role="radiogroup" aria-label={uz.checkout.destination} className="grid grid-cols-2 border-b border-ink">
          {COUNTRIES.map((d, i) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={country === d}
              onClick={() => setCountry(d)}
              className={cn(
                "flex h-12 items-center justify-center gap-2 text-base font-bold transition-colors duration-150",
                i > 0 && "border-l border-ink",
                country === d ? "bg-ink text-cell" : "hover:bg-paper",
              )}
            >
              {uz.destination[d]}
              {/* Counts are exact only once every order is loaded. */}
              {!more && rows && (
                <span className={cn("num rounded-sm px-1.5 text-xs", country === d ? "bg-cell text-ink" : "bg-paper text-ink-2")}>{count(d)}</span>
              )}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="grid gap-px">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-none" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-12 text-center text-ink-2">{rows.length === 0 ? uz.seller.myOrdersEmpty : uz.seller.noMatch}</p>
        ) : (
          groups.map((g) => (
            <section key={g.key} aria-label={groupTitle(g)}>
              <h2
                className={cn(
                  "flex items-center justify-between gap-2 border-b border-ink px-3 py-2 text-sm font-bold",
                  g.kind === "pending" ? "bg-warn-soft text-warn" : g.kind === "open" ? "bg-sand-soft" : "bg-paper",
                )}
              >
                <span>{groupTitle(g)}</span>
                <span className="num text-xs font-semibold">{uz.seller.boxCount(g.orders.length, g.orders.reduce((n, o) => n + o.item_count, 0))}</span>
              </h2>
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b border-rule-soft text-left">
                  <tr>
                    <th className="caption px-3 py-1.5">{uz.seller.colName}</th>
                    <th className="caption px-3 py-1.5 text-right">{uz.seller.colQty}</th>
                    <th className="caption px-3 py-1.5">{uz.seller.colAddress}</th>
                    <th className="caption px-3 py-1.5">{uz.seller.colPhone}</th>
                    <th className="caption px-3 py-1.5">{uz.seller.colStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.orders.map((o) => (
                    <tr key={o.id} className="relative border-b border-rule-soft last:border-b-ink hover:bg-paper">
                      <td className="px-3 py-2.5">
                        <Link href={`/buyurtmalarim/${o.id}`} className="font-semibold after:absolute after:inset-0">
                          {o.customer?.name || "—"}
                        </Link>
                        <span className="num block text-xs text-ink-3">{formatOrderNo(o.order_no)}</span>
                      </td>
                      <td className="num px-3 py-2.5 text-right font-bold">{o.item_count}</td>
                      <td className="px-3 py-2.5">{address(o)}</td>
                      <td className="num px-3 py-2.5 whitespace-nowrap">{o.customer ? formatPhone(o.customer.phone) : "—"}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="md:hidden">
                {g.orders.map((o) => (
                  <li key={o.id} className="border-b border-rule-soft last:border-b-ink">
                    <Link href={`/buyurtmalarim/${o.id}`} className="grid gap-0.5 px-3 py-2.5 active:bg-paper">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{o.customer?.name || "—"}</span>
                        <span className="num shrink-0 font-bold">{uz.seller.qty(o.item_count)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-2 text-sm text-ink-2">
                        <span className="truncate">{address(o)}</span>
                        <StatusBadge status={o.status} />
                      </span>
                      <span className="num text-xs text-ink-3">
                        {o.customer ? formatPhone(o.customer.phone) : ""} · {formatOrderNo(o.order_no)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {more && (
          <div className="flex justify-center border-t border-ink p-2">
            <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
              {uz.seller.loadMore}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
