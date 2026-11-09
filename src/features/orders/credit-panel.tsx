"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Krw } from "@/components/money";
import { Button } from "@/components/ui/button";
import type { OrderWithItems } from "@/lib/data/orders";
import { listCreditPayments, type CreditPayment } from "@/lib/data/credit";
import { creditTotal } from "@/lib/domain/credit";
import { formatDateTime } from "@/lib/domain/dates";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { CreditPaymentDialog } from "./credit-payment-dialog";

// Nasiya order: what is owed, the payments so far, and Toʻlov qoʻshish.
export function CreditPanel({ order }: { order: OrderWithItems }) {
  const router = useRouter();
  const [payments, setPayments] = useState<CreditPayment[] | null>(null);
  const [paying, setPaying] = useState(false);
  const [version, setVersion] = useState(0);
  const canPay = order.credit_due_krw > 0 && order.status !== "pending" && order.status !== "cancelled";

  useEffect(() => {
    let cancelled = false;
    listCreditPayments(supabaseBrowser(), order.id)
      .then((rows) => !cancelled && setPayments(rows))
      .catch(() => !cancelled && setPayments([]));
    return () => {
      cancelled = true;
    };
  }, [order.id, version]);

  const onPaid = useCallback(() => {
    setVersion((v) => v + 1);
    router.refresh();
  }, [router]);

  return (
    <section className="border-b border-ink">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule-soft bg-paper px-3 py-2">
        <h2 className="caption">{uz.nasiya.title}</h2>
        {canPay && (
          <Button size="sm" onClick={() => setPaying(true)}>
            <Plus aria-hidden />
            {uz.nasiya.addPayment}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-3 border-b border-rule-soft [&>*+*]:border-l [&>*+*]:border-rule-soft">
        <div className="cell">
          <span className="caption">{uz.nasiya.total}</span>
          <Krw value={creditTotal(order)} className="block font-bold" />
        </div>
        <div className="cell">
          <span className="caption">{uz.nasiya.paidAmount}</span>
          <Krw value={order.paid_krw} className="block font-bold" />
        </div>
        <div className="cell">
          <span className="caption">{uz.nasiya.left}</span>
          <Krw value={order.credit_due_krw} className={cn("block font-bold", order.credit_due_krw > 0 ? "text-warn" : "text-ok")} />
        </div>
      </div>
      <ol className="grid gap-1 px-3 py-2 text-sm">
        {payments === null ? null : payments.length === 0 ? (
          <li className="text-ink-3">{uz.nasiya.noPayments}</li>
        ) : (
          payments.map((p) => (
            <li key={p.id} className="flex gap-3">
              <span className="num w-32 shrink-0 text-ink-3">{formatDateTime(p.paid_at)}</span>
              <Krw value={p.amount_krw} className="font-semibold" />
              <span className="text-ink-2">· {p.recorder?.full_name ?? "—"}</span>
            </li>
          ))
        )}
      </ol>
      <CreditPaymentDialog order={paying ? order : null} onClose={() => setPaying(false)} onPaid={onPaid} />
    </section>
  );
}
