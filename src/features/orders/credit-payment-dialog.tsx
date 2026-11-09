"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { recordCreditPayment } from "@/lib/data/credit";
import { errorMessage } from "@/lib/domain/errors";
import { formatKrw } from "@/lib/domain/money";
import { formatOrderNo } from "@/lib/domain/order-no";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

// Toʻlov qoʻshish: the amount starts at what is left, so paying off is one tap.
export function CreditPaymentDialog({
  order,
  onClose,
  onPaid,
}: {
  order: { id: string; order_no: number; credit_due_krw: number; customer: { name: string | null } | null } | null;
  onClose(): void;
  onPaid(): void;
}) {
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden border border-ink p-0 sm:max-w-md">
        {order && <PaymentForm key={order.id} order={order} onClose={onClose} onPaid={onPaid} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  order,
  onClose,
  onPaid,
}: {
  order: { id: string; order_no: number; credit_due_krw: number; customer: { name: string | null } | null };
  onClose(): void;
  onPaid(): void;
}) {
  const [amount, setAmount] = useState(String(order.credit_due_krw));
  const [busy, setBusy] = useState(false);
  const n = Number(amount) || 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (n <= 0 || n > order.credit_due_krw) return;
    setBusy(true);
    try {
      const updated = await recordCreditPayment(supabaseBrowser(), order.id, n);
      toast.success(updated.credit_due_krw === 0 ? uz.nasiya.paidOff : uz.nasiya.recorded(formatKrw(n)));
      onPaid();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <DialogHeader className="border-b border-ink px-4 py-3">
        <DialogTitle className="text-lg">{uz.nasiya.addPayment}</DialogTitle>
        <DialogDescription>
          {formatOrderNo(order.order_no)} · {order.customer?.name || "—"} · {uz.nasiya.left}: <span className="num font-semibold">{formatKrw(order.credit_due_krw)}</span>
        </DialogDescription>
      </DialogHeader>
      <label className="cell block border-b border-ink">
        <span className="caption">{uz.nasiya.amount}</span>
        <span className="relative mt-1 block">
          <Input
            autoFocus
            value={amount}
            inputMode="numeric"
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 10))}
            aria-invalid={n > order.credit_due_krw || undefined}
            className="num h-12 pr-8 text-xl font-bold"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">₩</span>
        </span>
        {n > order.credit_due_krw && <span className="mt-1 block text-sm font-medium text-danger">{uz.errors.CREDIT_OVERPAY}</span>}
      </label>
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onClose}>
          {uz.common.cancel}
        </Button>
        <Button type="submit" disabled={busy || n <= 0 || n > order.credit_due_krw}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {uz.nasiya.save}
        </Button>
      </div>
    </form>
  );
}
