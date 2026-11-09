import { formatKrw, formatUsd } from "./money";

type Totals = { subtotal: number; shipping_krw: number; shipping_usd: number };

// Uzbekistan shipping is charged in USD and never converted: the total has two parts.
export function orderTotal(o: Totals): { krw: number; usd: number } {
  return { krw: o.subtotal + o.shipping_krw, usd: Number(o.shipping_usd) };
}

export function formatOrderTotal(o: Totals): string {
  const t = orderTotal(o);
  return t.usd > 0 ? `${formatKrw(t.krw)} + ${formatUsd(t.usd)}` : formatKrw(t.krw);
}
