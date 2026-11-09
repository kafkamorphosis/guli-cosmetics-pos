"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PaymentPicker } from "@/features/checkout/payment-picker";
import { PhoneField } from "@/features/checkout/phone-field";
import type { OrderWithItems } from "@/lib/data/orders";
import { errorMessage } from "@/lib/domain/errors";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatPhone, normalizePhone, type PhoneCountry } from "@/lib/domain/phone";
import type { PaymentMethod } from "@/lib/domain/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

// Tahrirlash: a finished order's client and payment method. Items, prices and stock stay as they are.
export function OrderEditDialog({ order, open, onClose, onSaved }: { order: OrderWithItems; open: boolean; onClose(): void; onSaved(): void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden border border-ink p-0 max-sm:max-h-dvh max-sm:overflow-y-auto sm:max-w-lg">
        {open && <EditForm order={order} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ order, onClose, onSaved }: { order: OrderWithItems; onClose(): void; onSaved(): void }) {
  const initialPhone = order.customer?.phone ?? "";
  const [country, setCountry] = useState<PhoneCountry>(initialPhone.startsWith("+998") ? "UZ" : "KR");
  const [phone, setPhone] = useState(initialPhone ? formatPhone(initialPhone) : "");
  const [name, setName] = useState(order.customer?.name ?? "");
  const [payment, setPayment] = useState<PaymentMethod>(order.payment_method);
  const [busy, setBusy] = useState(false);

  const e164 = normalizePhone(phone, country);
  const phoneInvalid = phone.trim() !== "" && !e164;
  const needsClient = order.type === "tekpe" || payment === "credit";
  const missingClient = needsClient && (!e164 || !name.trim());
  const lockedCredit = order.payment_method === "credit" && order.paid_krw > 0 && payment !== "credit";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (phoneInvalid || missingClient || lockedCredit) return;
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("update_order_info", {
      p_order_id: order.id,
      p_phone: e164 ?? "",
      p_name: name,
      p_payment: payment,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success(uz.orders.edited);
    onSaved();
    onClose();
  }

  return (
    <form onSubmit={save}>
      <DialogHeader className="border-b border-ink px-4 py-3">
        <DialogTitle className="text-lg">
          {uz.orders.editTitle} {formatOrderNo(order.order_no)}
        </DialogTitle>
        <DialogDescription>{uz.orders.editHint}</DialogDescription>
      </DialogHeader>
      <div className="cell border-b border-ink">
        <label htmlFor="edit-phone" className="caption">
          {uz.checkout.phone}
        </label>
        <div className="mt-1">
          <PhoneField id="edit-phone" country={country} onCountry={setCountry} value={phone} onChange={setPhone} invalid={phoneInvalid} />
        </div>
      </div>
      <label className="cell block border-b border-ink">
        <span className="caption">{uz.checkout.name}</span>
        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="mt-1 h-11 text-base" />
        {order.customer && <span className="mt-1 block text-xs text-ink-3">{uz.orders.nameIsClient}</span>}
      </label>
      <PaymentPicker id="edit-payment" value={payment} onChange={setPayment} />

      {(missingClient || lockedCredit) && (
        <p role="alert" className="border-b border-ink bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {lockedCredit ? uz.errors.CREDIT_HAS_PAYMENTS : order.type === "tekpe" ? uz.errors.TEKPE_NEEDS_CUSTOMER : uz.errors.NASIYA_NEEDS_CUSTOMER}
        </p>
      )}

      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onClose}>
          {uz.common.cancel}
        </Button>
        <Button type="submit" disabled={busy || phoneInvalid || missingClient || lockedCredit}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {uz.common.save}
        </Button>
      </div>
    </form>
  );
}
