import type { Destination, OrderType } from "./types";

export type ShippingRates = { krShippingKrw: number; uzShippingUsdPerKg: number };

export type Shipping = { shippingKrw: number; shippingUsd: number; shippingKg: number };

// Mirrors public.create_order in supabase/migrations/*_functions.sql — keep both in sync.
export function computeShipping(i: {
  type: OrderType;
  destination: Destination | null;
  totalWeightG: number;
  rates: ShippingRates;
}): Shipping {
  if (i.type === "store" || !i.destination) return { shippingKrw: 0, shippingUsd: 0, shippingKg: 0 };
  if (i.destination === "KR") return { shippingKrw: i.rates.krShippingKrw, shippingUsd: 0, shippingKg: 0 };
  const shippingKg = Math.max(1, Math.ceil(i.totalWeightG / 1000));
  return { shippingKrw: 0, shippingUsd: Number((shippingKg * i.rates.uzShippingUsdPerKg).toFixed(2)), shippingKg };
}
