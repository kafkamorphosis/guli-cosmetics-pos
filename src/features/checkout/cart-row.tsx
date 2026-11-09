"use client";

import { Minus, Plus, TriangleAlert, X } from "lucide-react";
import { Krw } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { isOverStock, unitPrice, type CartAction, type CartLine } from "@/lib/domain/cart";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

function QtyControl({ line, dispatch }: { line: CartLine; dispatch(a: CartAction): void }) {
  return (
    <div className="flex h-10 w-32 items-stretch overflow-hidden rounded-sm border border-ink">
      <button
        type="button"
        onClick={() => dispatch({ type: "dec", id: line.id })}
        disabled={line.qty <= 1}
        aria-label="−1"
        className="flex w-10 items-center justify-center border-r border-ink hover:bg-paper disabled:opacity-35"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        value={line.qty}
        inputMode="numeric"
        aria-label={`${uz.sheet.qty}: ${line.name}`}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const qty = Number(e.target.value.replace(/\D/g, ""));
          if (qty > 0) dispatch({ type: "setQty", id: line.id, qty });
        }}
        className="num min-w-0 flex-1 text-center text-base font-bold outline-none focus:bg-sand-soft"
      />
      <button
        type="button"
        onClick={() => dispatch({ type: "inc", id: line.id })}
        aria-label="+1"
        className="flex w-10 items-center justify-center border-l border-ink hover:bg-paper"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function OptomToggle({ line, dispatch }: { line: CartLine; dispatch(a: CartAction): void }) {
  return (
    <button
      type="button"
      aria-pressed={line.isWholesale}
      onClick={() => dispatch({ type: "toggleWholesale", id: line.id })}
      className={cn(
        "h-8 rounded-sm border px-2.5 text-xs font-bold tracking-wide uppercase transition-colors duration-150",
        line.isWholesale ? "border-ink bg-ink text-cell" : "border-input bg-cell text-ink-2 hover:border-ink hover:text-ink",
      )}
    >
      {uz.checkout.optom}
    </button>
  );
}

export function CartRow({
  line,
  index,
  fresh,
  dispatch,
  compact = false,
  hideOptom = false,
}: {
  line: CartLine;
  index: number;
  fresh: boolean;
  dispatch(a: CartAction): void;
  /** Always the stacked phone layout, for narrow side panels. */
  compact?: boolean;
  /** Customers in the Telegram shop always pay retail. */
  hideOptom?: boolean;
}) {
  const over = isOverStock(line);
  const price = unitPrice(line);

  return (
    <li className={cn("border-b border-rule-soft", fresh && "animate-feed bg-sand-soft/50")}>
      {/* Desktop row */}
      <div className={cn("hidden grid-cols-[2rem_2.75rem_minmax(0,1fr)_7rem_5rem_8rem_7.5rem_2.5rem] items-center gap-3 px-3 py-2", !compact && "xl:grid")}>
        <span className="num text-sm text-ink-3">{index + 1}</span>
        <ProductThumb path={line.photoPath} size={44} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{line.name}</span>
          <span className="num block text-xs tracking-wider text-ink-3">{line.barcode}</span>
          {over && (
            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warn">
              <TriangleAlert className="size-3.5" aria-hidden />
              {uz.checkout.overStock(Math.max(line.stock, 0))}
            </span>
          )}
        </span>
        <Krw value={price} className="text-right" />
        {hideOptom ? <span /> : <OptomToggle line={line} dispatch={dispatch} />}
        <QtyControl line={line} dispatch={dispatch} />
        <Krw value={price * line.qty} className="text-right text-base font-bold" />
        <button
          type="button"
          onClick={() => dispatch({ type: "remove", id: line.id })}
          aria-label={`${uz.checkout.remove}: ${line.name}`}
          className="flex size-9 items-center justify-center rounded-sm text-ink-3 hover:bg-danger-soft hover:text-danger"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Phone row */}
      <div className={cn("grid gap-2 px-3 py-3", !compact && "xl:hidden")}>
        <div className="flex items-start gap-3">
          <ProductThumb path={line.photoPath} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{line.name}</span>
            <Krw value={price} className="text-sm text-ink-2" />
            {over && (
              <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-warn">
                <TriangleAlert className="size-3.5" aria-hidden />
                {uz.checkout.overStock(Math.max(line.stock, 0))}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: "remove", id: line.id })}
            aria-label={`${uz.checkout.remove}: ${line.name}`}
            className="flex size-9 items-center justify-center rounded-sm text-ink-3 hover:bg-danger-soft hover:text-danger"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          {hideOptom ? <span /> : <OptomToggle line={line} dispatch={dispatch} />}
          <QtyControl line={line} dispatch={dispatch} />
          <Krw value={price * line.qty} className="min-w-20 text-right text-base font-bold" />
        </div>
      </div>
    </li>
  );
}
