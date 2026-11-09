"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, PackageCheck, Printer, QrCode, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { printOrder } from "@/features/print/print-order";
import { listOrders, type OrderListRow } from "@/lib/data/orders";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatKg } from "@/lib/domain/money";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { formatPhone } from "@/lib/domain/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { ApproveActions } from "@/features/orders/approve-actions";
import { BoxesTab } from "./boxes-tab";
import { ReadyScanDialog } from "./ready-scan-dialog";

type OrderTab = "pending" | "new" | "ready" | "picked_up";
type Tab = OrderTab | "boxes";
const PAGE = 100;
const ORDER_TABS: OrderTab[] = ["pending", "new", "ready", "picked_up"];
const TABS: Tab[] = ["pending", "boxes", "new", "ready", "picked_up"];

// Seller orders in a box move with their box (Qutilar tab), not one by one.
async function countStatus(status: OrderTab): Promise<number> {
  const { count } = await supabaseBrowser()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("type", "tekpe")
    .eq("status", status)
    .is("box_id", null);
  return count ?? 0;
}

export function TekpeScreen() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(sp.get("tab") === "boxes" ? "boxes" : "new");
  const [autoTab, setAutoTab] = useState(true);
  const [data, setData] = useState<{ tab: Tab; rows: OrderListRow[] } | null>(null);
  const [counts, setCounts] = useState<Record<OrderTab, number> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [limit, setLimit] = useState(PAGE);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ rows }, ...c] = await Promise.all([
          tab === "boxes" ? Promise.resolve({ rows: [] as OrderListRow[] }) : listOrders(supabaseBrowser(), { type: "tekpe", status: tab, noBox: true }, limit),
          ...ORDER_TABS.map(countStatus),
        ]);
        if (cancelled) return;
        setData({ tab, rows });
        setCounts({ pending: c[0], new: c[1], ready: c[2], picked_up: c[3] });
        // Open on the pending tab while seller orders wait, until the manager picks a tab themselves.
        if (autoTab && c[0] > 0 && tab !== "pending") setTab("pending");
      } catch (e) {
        if (!cancelled) toast.error(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, version, limit, autoTab]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabaseBrowser()
      .channel("tekpe-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        clearTimeout(timer);
        timer = setTimeout(reload, 300);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabaseBrowser().removeChannel(channel);
    };
  }, [reload]);

  async function move(ids: string[], status: "ready" | "picked_up") {
    setBusy(true);
    const results = await Promise.all(
      ids.map((id) => supabaseBrowser().rpc("set_order_status", { p_order_id: id, p_status: status })),
    );
    setBusy(false);
    const ok = results.filter((r) => !r.error).length;
    const firstError = results.find((r) => r.error)?.error;
    if (ids.length > 1) toast[ok === ids.length ? "success" : "warning"](uz.tekpe.bulkDone(ok, ids.length));
    else if (firstError) toast.error(errorMessage(firstError));
    else toast.success(status === "ready" ? uz.tekpe.readyDone : uz.tekpe.pickedDone);
    setSelected(new Set());
    reload();
  }

  const rows = data?.tab === tab ? data.rows : null;
  const allSelected = rows !== null && rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <>
      <PageHeader title={uz.tekpe.title}>
        <Button size="lg" onClick={() => setScanning(true)}>
          <QrCode aria-hidden />
          {uz.tekpe.scanReady}
        </Button>
      </PageHeader>

      <div className="waybill">
        <div role="tablist" aria-label={uz.tekpe.title} className="flex overflow-x-auto border-b border-ink sm:grid sm:grid-cols-5">
          {TABS.map((t, i) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => {
                setAutoTab(false);
                setTab(t);
                setLimit(PAGE);
                setSelected(new Set());
              }}
              className={cn(
                "flex shrink-0 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 max-sm:flex-1",
                i > 0 && "border-l border-ink",
                tab === t ? "bg-ink text-cell" : "hover:bg-paper",
              )}
            >
              {t === "boxes" ? uz.tekpe.boxesTab : uz.status[t]}
              {t !== "boxes" && (
                <span className={cn("num rounded-sm px-1.5 text-xs font-bold", tab === t ? "bg-cell text-ink" : "bg-paper text-ink-2")}>
                  {counts ? counts[t] : "·"}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "pending" && <p className="border-b border-ink bg-warn-soft px-3 py-2 text-sm text-warn">{uz.tekpe.pendingHint}</p>}

        {tab === "ready" && rows && rows.length > 0 && (
          <div className="flex items-center gap-3 border-b border-ink bg-paper px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
              />
              {uz.tekpe.selectAll}
            </label>
            <Button className="ml-auto" variant="ink" disabled={selected.size === 0 || busy} onClick={() => move([...selected], "picked_up")}>
              <Truck aria-hidden />
              {uz.tekpe.bulkPicked(selected.size)}
            </Button>
          </div>
        )}

        {tab === "boxes" ? (
          <BoxesTab />
        ) : rows === null ? (
          <div className="grid gap-px">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-ink-2">{uz.tekpe.empty[tab as OrderTab]}</p>
        ) : (
          <ul>
            {rows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule-soft px-3 py-3 last:border-0">
                {tab === "ready" && (
                  <Checkbox
                    checked={selected.has(o.id)}
                    aria-label={`${uz.tekpe.select}: ${formatOrderNo(o.order_no)}`}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (v) next.add(o.id);
                        else next.delete(o.id);
                        return next;
                      })
                    }
                  />
                )}
                <Link href={`/buyurtmalar/${o.id}`} className="monument text-2xl hover:underline sm:w-28">
                  {formatOrderNo(o.order_no)}
                </Link>
                <div className="min-w-40 flex-1 max-sm:order-last max-sm:basis-full">
                  <p className="font-semibold">{o.customer?.name ?? "—"}</p>
                  <p className="num text-xs text-ink-3">
                    {o.customer ? formatPhone(o.customer.phone) : ""} · {formatDateTime(o.created_at)}
                  </p>
                  {tab === "pending" && o.seller && <p className="text-xs font-semibold text-ink-2">{uz.tekpe.soldBy(o.seller.full_name)}</p>}
                </div>
                <span className="rounded-sm border border-ink px-2 py-0.5 text-xs font-bold uppercase">
                  {o.destination ? uz.destination[o.destination] : ""}
                </span>
                <span className="num text-sm text-ink-2 sm:w-28">
                  {o.item_count} {uz.common.pcs} · {formatKg(o.total_weight_g)}
                </span>
                <span className="num ml-auto text-right font-bold sm:ml-0 sm:w-36">{formatOrderTotal(o)}</span>
                <div className="flex gap-1.5 max-sm:order-last max-sm:w-full max-sm:justify-end">
                  {tab === "pending" ? (
                    <ApproveActions order={o} onDone={reload} />
                  ) : (
                    <Button variant="outline" size="icon-sm" onClick={() => printOrder(o.id)} aria-label={`${uz.common.print}: ${formatOrderNo(o.order_no)}`}>
                      <Printer aria-hidden />
                    </Button>
                  )}
                  {tab === "new" && (
                    <Button size="sm" onClick={() => move([o.id], "ready")} disabled={busy}>
                      <Check aria-hidden />
                      {uz.tekpe.markReady}
                    </Button>
                  )}
                  {tab === "ready" && (
                    <Button size="sm" variant="ink" onClick={() => move([o.id], "picked_up")} disabled={busy}>
                      <PackageCheck aria-hidden />
                      {uz.tekpe.markPicked}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab !== "boxes" && rows && counts && rows.length < counts[tab] && (
          <div className="border-t border-ink p-2 text-center">
            <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
              {uz.tekpe.loadMore(counts[tab] - rows.length)}
            </Button>
          </div>
        )}
      </div>

      <ReadyScanDialog open={scanning} onOpenChange={setScanning} onChanged={reload} />
    </>
  );
}
