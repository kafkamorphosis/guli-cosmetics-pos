"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Krw } from "@/components/money";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listCredit, type CreditRow } from "@/lib/data/credit";
import { creditTotal, outstanding } from "@/lib/domain/credit";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatPhone } from "@/lib/domain/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { CreditPaymentDialog } from "./credit-payment-dialog";

type Which = "due" | "paid";

export function CreditScreen() {
  const [which, setWhich] = useState<Which>("due");
  const [data, setData] = useState<{ which: Which; rows: CreditRow[] } | null>(null);
  const [paying, setPaying] = useState<CreditRow | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    listCredit(supabaseBrowser(), which)
      .then((rows) => !cancelled && setData({ which, rows }))
      .catch((e) => !cancelled && toast.error(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [which, version]);

  const rows = data?.which === which ? data.rows : null;
  const sum = rows ? outstanding(rows) : null;

  return (
    <>
      <PageHeader title={uz.nasiya.title} />

      {which === "due" && (
        <div className="waybill mb-4 grid grid-cols-2 [&>*+*]:border-l [&>*+*]:border-ink">
          <div className="cell">
            <span className="caption">{uz.nasiya.totalDue}</span>
            {sum ? <Krw value={sum.due} className="monument block text-figure max-sm:text-3xl text-warn" /> : <Skeleton className="mt-1 h-10 w-40" />}
          </div>
          <div className="cell">
            <span className="caption">{uz.nasiya.debtors}</span>
            {sum ? <span className="monument block text-figure max-sm:text-3xl">{sum.count}</span> : <Skeleton className="mt-1 h-10 w-16" />}
          </div>
        </div>
      )}

      <div className="waybill">
        <div role="radiogroup" aria-label={uz.nasiya.title} className="grid grid-cols-2 border-b border-ink">
          {(["due", "paid"] as const).map((w, i) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={which === w}
              onClick={() => setWhich(w)}
              className={cn(
                "h-11 text-sm font-bold transition-colors duration-150",
                i > 0 && "border-l border-ink",
                which === w ? "bg-ink text-cell" : "hover:bg-paper",
              )}
            >
              {w === "due" ? uz.nasiya.owing : uz.nasiya.paid}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="grid gap-px">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-ink-2">{which === "due" ? uz.nasiya.noDebts : uz.nasiya.nonePaid}</p>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-ink text-left">
                <tr>
                  <th className="caption px-3 py-2">{uz.orders.customer}</th>
                  <th className="caption px-3 py-2">{uz.orders.order}</th>
                  <th className="caption px-3 py-2 text-right">{uz.nasiya.total}</th>
                  <th className="caption px-3 py-2 text-right">{uz.nasiya.paidAmount}</th>
                  <th className="caption px-3 py-2 text-right">{uz.nasiya.left}</th>
                  <th className="w-40 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b border-rule-soft last:border-0 hover:bg-paper">
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold">{o.customer?.name || "—"}</span>
                      <span className="num block text-xs text-ink-3">{o.customer ? formatPhone(o.customer.phone) : ""}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/buyurtmalar/${o.id}`} className="monument text-lg hover:underline">
                        {formatOrderNo(o.order_no)}
                      </Link>
                      <span className="num block text-xs text-ink-3">{formatDateTime(o.created_at)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right"><Krw value={creditTotal(o)} /></td>
                    <td className="px-3 py-2.5 text-right text-ink-2"><Krw value={o.paid_krw} /></td>
                    <td className={cn("px-3 py-2.5 text-right font-bold", o.credit_due_krw > 0 && "text-warn")}>
                      <Krw value={o.credit_due_krw} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {o.credit_due_krw > 0 && (
                        <Button size="sm" onClick={() => setPaying(o)}>
                          <Plus aria-hidden />
                          {uz.nasiya.addPayment}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="md:hidden">
              {rows.map((o) => (
                <li key={o.id} className="grid gap-1.5 border-b border-rule-soft px-3 py-3 last:border-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{o.customer?.name || "—"}</span>
                    <Krw value={o.credit_due_krw} className={cn("font-bold", o.credit_due_krw > 0 && "text-warn")} />
                  </div>
                  <div className="num flex justify-between gap-2 text-xs text-ink-3">
                    <span>
                      {o.customer ? formatPhone(o.customer.phone) : ""} ·{" "}
                      <Link href={`/buyurtmalar/${o.id}`} className="underline">
                        {formatOrderNo(o.order_no)}
                      </Link>
                    </span>
                    <span>
                      {uz.nasiya.paidAmount}: <Krw value={o.paid_krw} /> / <Krw value={creditTotal(o)} />
                    </span>
                  </div>
                  {o.credit_due_krw > 0 && (
                    <Button size="sm" className="justify-self-end" onClick={() => setPaying(o)}>
                      <Plus aria-hidden />
                      {uz.nasiya.addPayment}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <CreditPaymentDialog order={paying} onClose={() => setPaying(null)} onPaid={reload} />
    </>
  );
}
