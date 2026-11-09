"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductThumb } from "@/components/product-thumb";
import type { Product } from "@/lib/database.types";
import { findProductByBarcode } from "@/lib/data/products";
import { uploadProductPhoto } from "@/lib/data/storage";
import { errorMessage } from "@/lib/domain/errors";
import { stockToSave } from "@/lib/domain/stock";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { resizeImage } from "./resize-image";
import { StockField } from "./stock-stepper";

const MAX_NUMBER = 2_000_000_000;

type Fields = { name: string; cost: string; retail: string; wholesale: string; weight: string; qty: string; threshold: string; stock: string };

function NumCell({
  label,
  value,
  onChange,
  required,
  suffix,
  className,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  required?: boolean;
  suffix?: string;
  className?: string;
}) {
  return (
    <label className={cn("cell border-b border-ink", className)}>
      <span className="caption">{label}</span>
      <span className="relative mt-1 block">
        <Input
          value={value}
          inputMode="numeric"
          required={required}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
            onChange(Number(digits) > MAX_NUMBER ? String(MAX_NUMBER) : digits);
          }}
          className={cn("num text-lg font-semibold", suffix && "pr-8")}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">{suffix}</span>}
      </span>
    </label>
  );
}

export function ProductForm({
  barcode,
  product,
  onSaved,
  onCancel,
  onExisting,
}: {
  barcode: string;
  product?: Product;
  onSaved(p: Product): void;
  onCancel(): void;
  /** The barcode turned out to exist (e.g. an earlier save half-finished): continue with that product. */
  onExisting?(p: Product): void;
}) {
  const editing = Boolean(product);
  const [f, setF] = useState<Fields>({
    name: product?.name ?? "",
    cost: product ? String(product.cost_price) : "",
    retail: product ? String(product.retail_price) : "",
    wholesale: product ? String(product.wholesale_price) : "",
    weight: product ? String(product.weight_g) : "",
    qty: "0",
    threshold: String(product?.low_stock_threshold ?? 10),
    stock: String(product?.stock ?? 0),
  });
  // The stock this form was opened with: saving refuses if another device changed it meanwhile.
  const [originalStock, setOriginalStock] = useState(product?.stock ?? 0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const set = (k: keyof Fields) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || f.cost === "" || f.retail === "" || f.wholesale === "" || f.weight === "") {
      setError(uz.inventory.requiredField);
      return;
    }
    setSaving(true);
    setError(null);
    const sb = supabaseBrowser();
    const values = {
      name: f.name.trim(),
      cost_price: Number(f.cost),
      retail_price: Number(f.retail),
      wholesale_price: Number(f.wholesale),
      weight_g: Number(f.weight),
      low_stock_threshold: Number(f.threshold || 10),
    };

    try {
      let saved: Product;
      // Stock first: if it moved on another device, nothing else is saved and the field shows the new value.
      const newStock = product ? stockToSave(originalStock, f.stock) : null;
      if (product && newStock !== null) {
        const { error } = await sb.rpc("adjust_stock", { p_product_id: product.id, p_new_stock: newStock, p_expected_stock: originalStock });
        if (error) {
          if (error.message === "STOCK_CHANGED") {
            const { data: fresh } = await sb.from("products").select("stock").eq("id", product.id).single();
            if (fresh) {
              setOriginalStock(fresh.stock);
              setF((s) => ({ ...s, stock: String(fresh.stock) }));
            }
          }
          throw error;
        }
      }
      if (product) {
        const { data, error } = await sb
          .from("products")
          .update({ ...values, ...(removePhoto ? { photo_path: null } : {}) })
          .eq("id", product.id)
          .select()
          .single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await sb.from("products").insert({ barcode, ...values }).select().single();
        if (error) {
          if (error.code === "23505") {
            const existing = await findProductByBarcode(sb, barcode, { includeArchived: true });
            setSaving(false);
            if (existing && onExisting) return onExisting(existing);
            setError(uz.inventory.barcodeExists);
            return;
          }
          throw error;
        }
        saved = data;
      }

      if (photo) {
        try {
          const path = await uploadProductPhoto(sb, saved.id, await resizeImage(photo));
          const { data, error } = await sb.from("products").update({ photo_path: path }).eq("id", saved.id).select().single();
          if (error) throw error;
          saved = data;
        } catch {
          toast.warning(uz.inventory.photoFailed);
        }
      }

      const qty = Number(f.qty || 0);
      if (!product && qty > 0) {
        const { data, error } = await sb.rpc("restock_product", { p_product_id: saved.id, p_qty: qty });
        if (error) throw error;
        saved = data;
      }

      toast.success(product ? uz.inventory.updated : uz.inventory.created);
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const currentPhoto = removePhoto ? null : product?.photo_path ?? null;

  return (
    <form onSubmit={onSubmit} className="grid" noValidate>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] border-b border-ink">
        <div className="cell flex items-center border-r border-ink">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-20 rounded-sm border border-rule-soft object-cover" />
          ) : (
            <ProductThumb path={currentPhoto} size={80} />
          )}
        </div>
        <div className="cell flex min-w-0 flex-col justify-center gap-2">
          <span className="caption">{uz.inventory.photoOptional}</span>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="h-auto min-h-9 py-1.5 text-left whitespace-normal">
              <label>
                <Camera aria-hidden />
                {uz.inventory.choosePhoto}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    setPhoto(e.target.files?.[0] ?? null);
                    setRemovePhoto(false);
                  }}
                />
              </label>
            </Button>
            {(photo || currentPhoto) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPhoto(null);
                  setRemovePhoto(true);
                }}
              >
                <X aria-hidden />
                {uz.inventory.removePhoto}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="cell border-b border-ink">
        <span className="caption">{uz.inventory.barcode}</span>
        <p className="num mt-1 text-base font-semibold tracking-wider">{barcode}</p>
      </div>
      <label className="cell border-b border-ink">
        <span className="caption">{uz.inventory.name}</span>
        <Input value={f.name} onChange={(e) => set("name")(e.target.value)} required autoFocus className="mt-1 text-lg font-semibold" />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-3">
        <NumCell label={uz.inventory.cost} value={f.cost} onChange={set("cost")} required suffix="₩" className="sm:border-r" />
        <NumCell label={uz.inventory.wholesale} value={f.wholesale} onChange={set("wholesale")} required suffix="₩" className="sm:border-r" />
        <NumCell label={uz.inventory.retail} value={f.retail} onChange={set("retail")} required suffix="₩" />
      </div>
      <div className={cn("grid grid-cols-1", editing ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        <NumCell label={uz.inventory.weight} value={f.weight} onChange={set("weight")} required suffix="g" className="sm:border-r" />
        {!editing && <NumCell label={uz.inventory.startQty} value={f.qty} onChange={set("qty")} className="sm:border-r" />}
        <NumCell label={uz.inventory.threshold} value={f.threshold} onChange={set("threshold")} />
      </div>
      {editing && <StockField value={f.stock} onChange={set("stock")} threshold={Number(f.threshold || 10)} />}

      {error && (
        <p role="alert" className="border-b border-ink bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          {uz.common.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {uz.common.save}
        </Button>
      </div>
    </form>
  );
}
