"use client";

import { forwardRef, useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { Krw } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { Input } from "@/components/ui/input";
import type { Product } from "@/lib/database.types";
import { searchProducts } from "@/lib/data/products";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { resolveEnter } from "./search-enter";

export const ProductSearch = forwardRef<
  HTMLInputElement,
  { onPick(p: Product): void; onBarcode(code: string): void }
>(function ProductSearch({ onPick, onBarcode }, ref) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [resultsFor, setResultsFor] = useState("");
  const [navigated, setNavigated] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchProducts(supabaseBrowser(), q).catch(() => []);
      if (cancelled) return;
      setResults(found);
      setResultsFor(q);
      setNavigated(false);
      setActive(0);
      setOpen(true);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function reset() {
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function pick(p: Product) {
    onPick(p);
    reset();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setNavigated(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setNavigated(true);
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      reset();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const d = resolveEnter({ query, resultsFor, results, active, navigated });
      if (d.kind === "pick") pick(d.product);
      else if (d.kind === "barcode") {
        onBarcode(d.code);
        reset();
      }
    }
  }

  const showList = open && query.trim().length >= 2;

  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <Input
        ref={ref}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length < 2) setOpen(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={uz.checkout.searchPlaceholder}
        aria-label={uz.checkout.searchPlaceholder}
        aria-keyshortcuts="F1"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
        autoComplete="off"
        className="h-11 pl-9 text-base lg:pr-12"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-sm border border-input px-1.5 text-xs font-semibold text-ink-3 lg:block">
        F2
      </kbd>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-sm border border-ink bg-cell shadow-[0_8px_24px_rgb(20_20_20/0.12)]"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-2">{uz.checkout.noResults}</li>
          ) : (
            results.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-rule-soft px-3 py-2 last:border-0",
                  i === active && "bg-sand-soft",
                )}
              >
                <ProductThumb path={p.photo_path} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="num block text-xs tracking-wider text-ink-3">{p.barcode}</span>
                </span>
                <span className="text-right text-sm">
                  <Krw value={p.retail_price} className="block font-semibold" />
                  <span className="num block text-xs text-ink-3">
                    {uz.inventory.stock}: {p.stock}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
});
