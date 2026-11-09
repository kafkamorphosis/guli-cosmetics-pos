"use client";

import { Loader2, Truck } from "lucide-react";
import { Weight } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerSummary } from "@/lib/data/customers";
import { formatKrw } from "@/lib/domain/money";
import type { PhoneCountry } from "@/lib/domain/phone";
import type { PaymentMethod } from "@/lib/domain/types";
import { uz } from "@/lib/i18n/uz";
import { PaymentPicker } from "./payment-picker";
import { PhoneField } from "./phone-field";
import { useTween } from "./use-tween";


export type CustomerState = {
  country: PhoneCountry;
  phone: string;
  name: string;
  payment: PaymentMethod;
  /** Seller orders only: where the client is, for the box list. */
  city?: string;
  district?: string;
};

export function CustomerPanel({
  state,
  onChange,
  customer,
  phoneInvalid,
  totals,
  busy,
  disabled,
  onCheckout,
  onTekpe,
}: {
  state: CustomerState;
  onChange(patch: Partial<CustomerState>): void;
  customer: CustomerSummary | null | undefined;
  phoneInvalid: boolean;
  totals: { itemCount: number; lineCount: number; totalWeightG: number; subtotal: number };
  busy: boolean;
  disabled: boolean;
  onCheckout(): void;
  onTekpe(): void;
}) {
  const shownTotal = useTween(totals.subtotal);

  return (
    <div className="flex h-full flex-col">
      <div className="cell border-b border-ink">
        <label htmlFor="checkout-phone" className="caption">
          {uz.checkout.phone}
        </label>
        <div className="mt-1">
          <PhoneField
            id="checkout-phone"
            country={state.country}
            onCountry={(country) => onChange({ country })}
            value={state.phone}
            onChange={(phone) => onChange({ phone })}
            invalid={phoneInvalid}
          />
        </div>
        <p className="mt-1.5 min-h-5 text-sm" aria-live="polite">
          {phoneInvalid ? (
            <span className="font-medium text-danger">{uz.checkout.phoneInvalid}</span>
          ) : customer ? (
            <span className="font-semibold text-ok">{uz.checkout.regular(customer.orderCount)}</span>
          ) : customer === null ? (
            <span className="text-ink-2">{uz.checkout.newCustomer}</span>
          ) : null}
        </p>
      </div>

      <label className="cell border-b border-ink">
        <span className="caption">{uz.checkout.name}</span>
        <Input value={state.name} onChange={(e) => onChange({ name: e.target.value })} autoComplete="off" className="mt-1 h-11 text-base" />
      </label>

      <PaymentPicker id="payment-label" value={state.payment} onChange={(payment) => onChange({ payment })} />

      <div className="grid grid-cols-2 border-b border-ink">
        <div className="cell border-r border-ink">
          <span className="caption">{uz.checkout.items}</span>
          <p className="num text-lg font-bold">
            {totals.itemCount} <span className="text-sm font-medium text-ink-3">· {uz.checkout.lines(totals.lineCount)}</span>
          </p>
        </div>
        <div className="cell">
          <span className="caption">{uz.checkout.weight}</span>
          <Weight grams={totals.totalWeightG} className="block text-lg font-bold" />
        </div>
      </div>

      <div className="cell mt-auto border-b border-ink py-3">
        <span className="caption">{uz.checkout.total}</span>
        <p className="monument text-monument" aria-live="polite">
          {formatKrw(shownTotal)}
        </p>
      </div>

      <div className="grid gap-2 p-3">
        <Button size="xl" className="w-full text-xl" onClick={onCheckout} disabled={disabled || busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {uz.checkout.checkout}
          <kbd className="ml-auto hidden rounded-sm border border-sand-ink/30 px-1.5 text-xs font-semibold lg:inline">F9</kbd>
        </Button>
        <Button size="lg" variant="outline" className="w-full" onClick={onTekpe} disabled={disabled || busy}>
          <Truck aria-hidden />
          {uz.checkout.tekpe}
        </Button>
      </div>
    </div>
  );
}
