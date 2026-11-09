"use client";

import { Plus } from "lucide-react";
import { Krw } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import type { CartProduct } from "@/lib/domain/cart";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export function CatalogGrid({
  products,
  qtyInCart,
  onAdd,
}: {
  products: CartProduct[];
  qtyInCart(id: string): number;
  onAdd(p: CartProduct): void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-px bg-rule-soft sm:grid-cols-3 2xl:grid-cols-4">
      {products.map((p) => {
        const inCart = qtyInCart(p.id);
        return (
          <li key={p.id} className="bg-cell">
            <button
              type="button"
              onClick={() => onAdd(p)}
              aria-label={uz.seller.add(p.name)}
              className={cn(
                "group relative flex h-full w-full flex-col gap-2 p-3 text-left transition-colors duration-150 hover:bg-paper active:bg-sand-soft",
                inCart > 0 && "bg-sand-soft/40",
              )}
            >
              <ProductThumb path={p.photoPath} size={96} className="w-full! aspect-square h-auto!" />
              <span className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold">{p.name}</span>
              <span className="flex items-end justify-between gap-2">
                <Krw value={p.retailPrice} className="text-base font-bold" />
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-ink bg-sand text-sand-ink group-hover:bg-ink group-hover:text-cell"
                >
                  <Plus className="size-4" />
                </span>
              </span>
              <span className={cn("num text-xs", p.stock > 0 ? "text-ink-3" : "font-semibold text-warn")}>
                {p.stock > 0 ? uz.seller.inStock(p.stock) : uz.seller.outOfStock}
                {inCart > 0 && <span className="ml-2 font-bold text-ink">· {uz.seller.inCart(inCart)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
