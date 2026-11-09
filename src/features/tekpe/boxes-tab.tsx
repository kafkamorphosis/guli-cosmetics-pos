"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PackageCheck, PackageX, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { printBox } from "@/features/print/print-order";
import { countBoxes, listBoxes, liveTotals, type BoxRow, type BoxStatus } from "@/lib/data/boxes";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatKg, formatKrw, formatUsd } from "@/lib/domain/money";
import { formatBoxNo } from "@/lib/domain/order-no";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const STATUSES: BoxStatus[] = ["open", "closed", "picked_up"];

function shippingLabel(b: BoxRow): string {
  if (b.status === "open") return "—";
  return b.destination === "UZ" ? `${b.shipping_kg} kg · ${formatUsd(b.shipping_usd)}` : formatKrw(b.shipping_krw);
}

export function BoxesTab() {
  const [status, setStatus] = useState<BoxStatus>("open");
  const [data, setData] = useState<{ status: BoxStatus; rows: BoxRow[] } | null>(null);
  const [counts, setCounts] = useState<Record<BoxStatus, number> | null>(null);
  const [closing, setClosing] = useState<BoxRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    const sb = supabaseBrowser();
    Promise.all([listBoxes(sb, status), ...STATUSES.map((s) => countBoxes(sb, s))])
      .then(([rows, ...c]) => {
        if (cancelled) return;
        setData({ status, rows: rows as BoxRow[] });
        setCounts({ open: c[0] as number, closed: c[1] as number, picked_up: c[2] as number });
      })
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [status, version]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sb = supabaseBrowser();
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 300);
    };
    const channel = sb
      .channel("tekpe-boxes")
      .on("postgres_changes", { event: "*", schema: "public", table: "boxes" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, bump)
      .subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [reload]);

  async function close(box: BoxRow) {
    setBusy(box.id);
    const { error } = await supabaseBrowser().rpc("close_box", { p_box_id: box.id });
    setBusy(null);
    setClosing(null);
    if (error) {
      toast.error(errorMessage(error));
    } else if (window.matchMedia("(pointer: coarse)").matches) {
      // After the await the tap no longer counts, and a new tab would be blocked as a popup.
      toast.success(uz.tekpe.boxClosed(formatBoxNo(box.box_no)), {
        duration: 15_000,
        action: { label: uz.common.print, onClick: () => printBox(box.id) },
      });
    } else {
      toast.success(uz.tekpe.boxClosed(formatBoxNo(box.box_no)));
      printBox(box.id);
    }
    reload();
  }

  async function pickedUp(box: BoxRow) {
    setBusy(box.id);
    const { error } = await supabaseBrowser().rpc("box_picked_up", { p_box_id: box.id });
    setBusy(null);
    if (error) toast.error(errorMessage(error));
    else toast.success(uz.tekpe.boxPickedUp(formatBoxNo(box.box_no)));
    reload();
  }

  const rows = data?.status === status ? data.rows : null;

  return (
    <>
      <div role="radiogroup" aria-label={uz.tekpe.boxesTab} className="flex flex-wrap gap-1.5 border-b border-ink bg-paper p-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "h-9 rounded-sm border px-3 text-sm font-semibold transition-colors duration-150",
              status === s ? "border-ink bg-ink text-cell" : "border-rule-soft bg-cell hover:bg-paper",
            )}
          >
            {uz.tekpe.boxStatus[s]}
            <span className="num ml-1.5 opacity-70">{counts ? counts[s] : "·"}</span>
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="grid gap-px">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-none" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-ink-2">{uz.tekpe.boxesEmpty[status]}</p>
      ) : (
        <ul>
          {rows.map((b) => {
            const t = liveTotals(b);
            return (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule-soft px-3 py-3 last:border-0">
                <span className="monument text-2xl sm:w-28">{formatBoxNo(b.box_no)}</span>
                <div className="min-w-40 flex-1 max-sm:order-last max-sm:basis-full">
                  <p className="font-semibold">{b.seller?.full_name || b.seller?.username || "—"}</p>
                  <p className="num text-xs text-ink-3">
                    {uz.tekpe.boxSummary(t.orders, t.items)} · {formatKg(t.weightG)}
                    {b.closed_at ? ` · ${formatDateTime(b.closed_at)}` : ""}
                  </p>
                </div>
                <span className="rounded-sm border border-ink px-2 py-0.5 text-xs font-bold uppercase">{uz.destination[b.destination]}</span>
                <span className="num ml-auto text-right font-bold sm:ml-0 sm:w-36">{shippingLabel(b)}</span>
                <div className="flex gap-1.5 max-sm:order-last max-sm:w-full max-sm:justify-end">
                  {b.status === "open" ? (
                    <Button size="sm" onClick={() => setClosing(b)} disabled={busy !== null || t.orders === 0}>
                      <PackageX aria-hidden />
                      {uz.tekpe.closeAndPrint}
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => printBox(b.id)}>
                      <Printer aria-hidden />
                      {uz.common.print}
                    </Button>
                  )}
                  {b.status === "closed" && (
                    <Button size="sm" variant="ink" onClick={() => pickedUp(b)} disabled={busy !== null}>
                      {busy === b.id ? <Loader2 className="animate-spin" aria-hidden /> : <PackageCheck aria-hidden />}
                      {uz.tekpe.markPicked}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={closing !== null} onOpenChange={(o) => !o && setClosing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{closing ? uz.tekpe.closeTitle(formatBoxNo(closing.box_no)) : ""}</AlertDialogTitle>
            <AlertDialogDescription>{uz.tekpe.closeHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uz.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (closing) close(closing);
              }}
              disabled={busy !== null}
            >
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {uz.tekpe.closeAndPrint}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
