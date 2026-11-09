"use client";

import { Minus, Plus } from "lucide-react";
import { stepStock } from "@/lib/domain/stock";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const STEP = 10;

// Bar length is an exact proportion: the low-stock line sits at one third of the track,
// so a product at its threshold fills exactly to the line.
export function StockBar({ stock, threshold }: { stock: number; threshold: number }) {
  const full = Math.max(threshold, 1) * 3;
  const pct = Math.max(0, Math.min(1, stock / full)) * 100;
  const low = stock <= threshold;
  return (
    <span className="relative block h-1 w-full bg-rule-soft" aria-hidden>
      <span className={cn("absolute inset-y-0 left-0", low ? "bg-warn" : "bg-ink")} style={{ width: `${pct}%` }} />
      <span className="absolute inset-y-[-2px] left-1/3 w-px bg-ink-3" />
    </span>
  );
}

// The list only shows stock; changing it goes through Tahrirlash so a stray tap can't.
export function StockReadout({ stock, threshold }: { stock: number; threshold: number }) {
  const low = stock <= threshold;
  return (
    <div className="flex w-32 flex-col gap-1.5">
      <span className={cn("num text-right text-base font-bold", low && "text-warn")} aria-label={`${uz.inventory.stock}: ${stock}`}>
        {stock} <span className="text-xs font-semibold text-ink-3">{uz.common.pcs}</span>
      </span>
      <StockBar stock={stock} threshold={threshold} />
    </div>
  );
}

// Tahrirlash: −10 / +10 and typing change the field only; the form writes it on Saqlash.
export function StockField({ value, onChange, threshold }: { value: string; onChange(v: string): void; threshold: number }) {
  const n = Number(value) || 0;
  return (
    <div className="cell border-b border-ink">
      <label htmlFor="stock-field" className="caption">
        {uz.inventory.stockOnHand}
      </label>
      <div className="mt-1 flex h-11 items-stretch overflow-hidden rounded-sm border border-ink">
        <button
          type="button"
          onClick={() => onChange(stepStock(value, -STEP))}
          disabled={n <= 0}
          aria-label={`−${STEP}`}
          className="flex w-16 items-center justify-center gap-0.5 border-r border-ink text-sm font-bold hover:bg-paper disabled:opacity-40"
        >
          <Minus className="size-3.5" aria-hidden />
          {STEP}
        </button>
        <input
          id="stock-field"
          value={value}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className={cn("num min-w-0 flex-1 text-center text-lg font-bold outline-none focus:bg-sand-soft", n <= threshold && "text-warn")}
        />
        <button
          type="button"
          onClick={() => onChange(stepStock(value, STEP))}
          aria-label={`+${STEP}`}
          className="flex w-16 items-center justify-center gap-0.5 border-l border-ink text-sm font-bold hover:bg-paper"
        >
          <Plus className="size-3.5" aria-hidden />
          {STEP}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{uz.inventory.stockHint}</p>
    </div>
  );
}
