"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatKrw, formatUsd } from "@/lib/domain/money";
import { formatOrderTotal } from "@/lib/domain/order-total";
import { normalizePhone } from "@/lib/domain/phone";
import { computeShipping, type ShippingRates } from "@/lib/domain/shipping";
import type { Destination } from "@/lib/domain/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import type { CustomerState } from "./customer-panel";
import { PaymentPicker } from "./payment-picker";
import { PhoneField } from "./phone-field";

export function TekpeDialog({
  open,
  onOpenChange,
  state,
  onChange,
  totals,
  rates,
  busy,
  offline = false,
  showPayment = false,
  showAddress = false,
  shipsAlone = false,
  confirmLabel = uz.checkout.createTekpe,
  onConfirm,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  state: CustomerState;
  onChange(patch: Partial<CustomerState>): void;
  totals: { subtotal: number; totalWeightG: number };
  rates: ShippingRates | null;
  busy: boolean;
  offline?: boolean;
  /** Sellers pick the payment method here; Kassa picks it in the side panel. */
  showPayment?: boolean;
  /** Sellers also give the client's city and district (printed on the box list). */
  showAddress?: boolean;
  /** With an address but its own shipping (Telegram shop orders are not boxed). */
  shipsAlone?: boolean;
  confirmLabel?: string;
  onConfirm(destination: Destination): void;
}) {
  const [destination, setDestination] = useState<Destination>("KR");
  const [touched, setTouched] = useState(false);
  const phone = normalizePhone(state.phone, state.country);
  const missingAddress = showAddress && (!state.city?.trim() || !state.district?.trim());
  const missing = !phone || !state.name.trim() || missingAddress;
  const shipping = rates ? computeShipping({ type: "tekpe", destination, totalWeightG: totals.totalWeightG, rates }) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border border-ink p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-ink px-4 py-3">
          <DialogTitle className="text-lg">{uz.checkout.tekpeTitle}</DialogTitle>
          <DialogDescription className="sr-only">{uz.checkout.destination}</DialogDescription>
        </DialogHeader>

        <div className="cell border-b border-ink">
          <span className="caption" id="dest-label">
            {uz.checkout.destination}
          </span>
          <div role="radiogroup" aria-labelledby="dest-label" className="mt-1 grid grid-cols-2 overflow-hidden rounded-sm border border-ink">
            {(["KR", "UZ"] as const).map((d, i) => {
              const s = rates ? computeShipping({ type: "tekpe", destination: d, totalWeightG: totals.totalWeightG, rates }) : null;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={destination === d}
                  onClick={() => setDestination(d)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 px-3 py-3 text-left transition-colors duration-150",
                    i > 0 && "border-l border-ink",
                    destination === d ? "bg-ink text-cell" : "bg-cell hover:bg-paper",
                  )}
                >
                  <span className="text-base font-bold">{uz.destination[d]}</span>
                  {(!showAddress || shipsAlone) && (
                    <span className={cn("num text-sm", destination === d ? "text-cell/80" : "text-ink-2")}>
                      {s ? (d === "KR" ? `${formatKrw(s.shippingKrw)} · ${uz.checkout.perOrder}` : `${s.shippingKg} kg · ${formatUsd(s.shippingUsd)}`) : "…"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="cell border-b border-ink">
          <label htmlFor="tekpe-phone" className="caption">
            {uz.checkout.phone}
          </label>
          <div className="mt-1">
            <PhoneField
              id="tekpe-phone"
              country={state.country}
              onCountry={(country) => onChange({ country })}
              value={state.phone}
              onChange={(v) => onChange({ phone: v })}
              invalid={touched && !phone}
            />
          </div>
        </div>
        <label className="cell border-b border-ink">
          <span className="caption">{uz.checkout.name}</span>
          <Input
            value={state.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-invalid={(touched && !state.name.trim()) || undefined}
            className="mt-1 h-11 text-base"
          />
        </label>

        {showAddress && (
          <div className="grid grid-cols-2 border-b border-ink">
            <label className="cell border-r border-ink">
              <span className="caption">{uz.checkout.city}</span>
              <Input
                value={state.city ?? ""}
                maxLength={120}
                onChange={(e) => onChange({ city: e.target.value })}
                aria-invalid={(touched && !state.city?.trim()) || undefined}
                className="mt-1 h-11 text-base"
              />
            </label>
            <label className="cell">
              <span className="caption">{uz.checkout.district}</span>
              <Input
                value={state.district ?? ""}
                maxLength={120}
                onChange={(e) => onChange({ district: e.target.value })}
                aria-invalid={(touched && !state.district?.trim()) || undefined}
                className="mt-1 h-11 text-base"
              />
            </label>
          </div>
        )}

        {showPayment && <PaymentPicker id="tekpe-payment" value={state.payment} onChange={(payment) => onChange({ payment })} />}

        {showAddress && !shipsAlone ? (
          <div className="cell border-b border-ink">
            <span className="caption">{uz.checkout.total}</span>
            <p className="monument text-2xl">{formatKrw(totals.subtotal)}</p>
            <p className="text-xs text-ink-3">{uz.checkout.shippingOnBox}</p>
          </div>
        ) : shipping && (
          <div className="grid grid-cols-2 border-b border-ink">
            <div className="cell border-r border-ink">
              <span className="caption">{uz.checkout.shipping}</span>
              <p className="num text-lg font-bold">
                {destination === "KR" ? formatKrw(shipping.shippingKrw) : `${shipping.shippingKg} kg · ${formatUsd(shipping.shippingUsd)}`}
              </p>
            </div>
            <div className="cell">
              <span className="caption">{uz.checkout.total}</span>
              <p className="monument text-2xl">
                {formatOrderTotal({ subtotal: totals.subtotal, shipping_krw: shipping.shippingKrw, shipping_usd: shipping.shippingUsd })}
              </p>
            </div>
          </div>
        )}

        {touched && missing && (
          <p role="alert" className="border-b border-ink bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
            {showAddress ? uz.checkout.tekpeNeedsAddress : uz.checkout.tekpeNeedsCustomer}
          </p>
        )}

        <div className="dialog-actions">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {uz.common.cancel}
          </Button>
          <Button
            size="lg"
            disabled={busy || !rates || offline}
            onClick={() => {
              setTouched(true);
              if (!missing) onConfirm(destination);
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
