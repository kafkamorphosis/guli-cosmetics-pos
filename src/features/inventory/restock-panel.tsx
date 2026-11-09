"use client";

import { useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Krw } from "@/components/money";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/lib/database.types";
import { MAX_QTY } from "@/lib/domain/cart";
import { errorMessage } from "@/lib/domain/errors";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

const STEP = 10;

export function RestockPanel({ product, onDone, onCancel }: { product: Product; onDone(p: Product): void; onCancel(): void }) {
  const [qty, setQty] = useState(STEP);
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (qty < 1) return;
    setSaving(true);
    const { data, error } = await supabaseBrowser().rpc("restock_product", {
      p_product_id: product.id,
      p_qty: qty,
      ...(cost !== "" ? { p_cost_price: Number(cost) } : {}),
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(uz.inventory.restockDone(qty));
    onDone(data);
  }

  return (
    <form onSubmit={save} className="grid">
      <div className="flex items-center gap-3 border-b border-ink px-3 py-3">
        <ProductThumb path={product.photo_path} size={56} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{product.name}</p>
          <p className="num text-sm text-ink-2">
            {product.barcode} · {uz.inventory.stock}: <span className="font-semibold text-ink">{product.stock}</span>
          </p>
        </div>
      </div>
      <div className="cell border-b border-ink">
        <span className="caption">{uz.inventory.quantity}</span>
        <div className="mt-1 flex h-14 items-stretch overflow-hidden rounded-sm border border-ink">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - STEP))}
            className="flex w-20 items-center justify-center gap-1 border-r border-ink font-bold hover:bg-paper"
            aria-label={`−${STEP}`}
          >
            <Minus className="size-4" aria-hidden />
            {STEP}
          </button>
          <input
            value={qty === 0 ? "" : qty}
            inputMode="numeric"
            aria-label={uz.inventory.quantity}
            onChange={(e) => setQty(Math.min(MAX_QTY, Number(e.target.value.replace(/\D/g, "") || 0)))}
            onFocus={(e) => e.currentTarget.select()}
            className="monument min-w-0 flex-1 text-center text-3xl outline-none focus:bg-sand-soft"
          />
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(MAX_QTY, q + STEP))}
            className="flex w-20 items-center justify-center gap-1 border-l border-ink font-bold hover:bg-paper"
            aria-label={`+${STEP}`}
          >
            <Plus className="size-4" aria-hidden />
            {STEP}
          </button>
        </div>
      </div>
      <label className="cell border-b border-ink">
        <span className="caption">{uz.inventory.newCost}</span>
        <span className="mt-1 flex items-center gap-3">
          <Input
            value={cost}
            inputMode="numeric"
            placeholder={String(product.cost_price)}
            onChange={(e) => setCost(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="num max-w-40 font-semibold"
          />
          <span className="text-sm text-ink-3">
            {uz.inventory.cost}: <Krw value={product.cost_price} />
          </span>
        </span>
      </label>
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          {uz.common.cancel}
        </Button>
        <Button type="submit" disabled={saving || qty < 1}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {uz.inventory.restockTitle}
        </Button>
      </div>
    </form>
  );
}
