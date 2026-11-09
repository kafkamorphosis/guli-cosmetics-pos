"use client";

import { CheckCircle2, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Order } from "@/lib/database.types";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { printOrder } from "@/features/print/print-order";
import { orderTypeLabel } from "@/lib/i18n/labels";
import { uz } from "@/lib/i18n/uz";

export function SuccessDialog({ order, onNewOrder }: { order: Order | null; onNewOrder(): void }) {
  return (
    <Dialog open={order !== null} onOpenChange={(o) => !o && onNewOrder()}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden border border-ink p-0 sm:max-w-md">
        {order && (
          <>
            <div className="flex items-center gap-2 border-b border-ink bg-ok-soft px-4 py-3 text-ok">
              <CheckCircle2 className="size-5" aria-hidden />
              <DialogTitle className="text-base font-bold text-ok">{uz.checkout.successTitle}</DialogTitle>
            </div>
            <div className="border-b border-ink px-4 py-5 text-center">
              <p className="monument text-[4.5rem] leading-none">{formatOrderNo(order.order_no)}</p>
              <DialogDescription className="mt-2 text-sm text-ink-2">
                {orderTypeLabel(order)} · {uz.payment[order.payment_method]}
              </DialogDescription>
              <p className="monument mt-3 text-3xl">{formatOrderTotal(order)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3">
              <Button size="lg" variant="outline" onClick={() => printOrder(order.id)}>
                <Printer aria-hidden />
                {uz.common.print}
              </Button>
              <Button size="lg" onClick={onNewOrder} autoFocus>
                <Plus aria-hidden />
                {uz.checkout.newOrder}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
