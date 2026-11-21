"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, ImageIcon, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { scanFeedback } from "@/components/scanner/feedback";
import { useHidScanner } from "@/components/scanner/use-hid-scanner";
import { ProductThumb } from "@/components/product-thumb";
import { Button } from "@/components/ui/button";
import { ProductSearch } from "@/features/checkout/product-search";
import { resizeImage } from "@/features/inventory/resize-image";
import type { Product } from "@/lib/database.types";
import { findProductByBarcode } from "@/lib/data/products";
import { uploadProductPhoto } from "@/lib/data/storage";
import { errorMessage } from "@/lib/domain/errors";
import { formatKrw } from "@/lib/domain/money";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

export function MobilePhoto() {
  const [camera, setCamera] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const shootRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function pick(p: Product) {
    setProduct(p);
    setSaved(false);
    setCamera(false);
  }

  async function byBarcode(code: string) {
    try {
      const p = await findProductByBarcode(supabaseBrowser(), code);
      scanFeedback(Boolean(p));
      if (p) pick(p);
      else toast.error(`${uz.mobile.notFound}: ${code}`);
    } catch (e) {
      scanFeedback(false);
      toast.error(errorMessage(e));
    }
  }

  useHidScanner(byBarcode);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !product) return;
    setSaving(true);
    try {
      const sb = supabaseBrowser();
      const path = await uploadProductPhoto(sb, product.id, await resizeImage(file));
      const { data, error } = await sb.from("products").update({ photo_path: path }).eq("id", product.id).select().single();
      if (error) throw error;
      setProduct(data);
      setSaved(true);
      toast.success(uz.mobile.photoSaved);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function next() {
    setProduct(null);
    setSaved(false);
    setCamera(true);
  }

  return (
    <main className="flex flex-1 flex-col">
      <input ref={shootRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

      {!product ? (
        <>
          <div className="border-b border-ink p-2">
            <ProductSearch onPick={pick} onBarcode={byBarcode} />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <Camera className="size-16 text-ink-3" strokeWidth={1.25} aria-hidden />
            <p className="text-2xl font-bold">{uz.mobile.photoStep}</p>
          </div>
          <div className="border-t-2 border-ink p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Button className="h-16 w-full text-lg" variant="outline" onClick={() => setCamera(true)}>
              <ScanBarcode className="size-6" aria-hidden />
              {uz.mobile.scan}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center gap-4 p-4">
            <div className="relative">
              <ProductThumb path={product.photo_path} size={260} className="rounded-xl border-2 border-ink" />
              {saved && <CheckCircle2 className="absolute -top-3 -right-3 size-12 rounded-full bg-cell text-ok" aria-hidden />}
              {saving && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-cell/80 font-semibold">
                  <Loader2 className="size-10 animate-spin" aria-hidden />
                  {uz.mobile.saving}
                </span>
              )}
            </div>
            {!product.photo_path && !saving && <p className="text-ink-3">{uz.mobile.noPhoto}</p>}
            <div className="text-center">
              <p className="text-2xl font-bold leading-tight">{product.name}</p>
              <p className="num mt-1 text-ink-2">
                {product.barcode} · {formatKrw(product.retail_price)}
              </p>
            </div>
          </div>
          <div className="grid gap-2 border-t-2 border-ink p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {saved ? (
              <Button className="h-16 text-xl" onClick={next}>
                <ScanBarcode className="size-6" aria-hidden />
                {uz.mobile.nextProduct}
              </Button>
            ) : (
              <Button className="h-16 text-xl" onClick={() => shootRef.current?.click()} disabled={saving}>
                <Camera className="size-6" aria-hidden />
                {product.photo_path ? uz.mobile.retakePhoto : uz.mobile.takePhoto}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={() => galleryRef.current?.click()} disabled={saving}>
                <ImageIcon aria-hidden />
                {uz.mobile.gallery}
              </Button>
              <Button variant="outline" className="h-12" onClick={saved ? () => shootRef.current?.click() : next} disabled={saving}>
                {saved ? <Camera aria-hidden /> : <ScanBarcode aria-hidden />}
                {saved ? uz.mobile.retakePhoto : uz.mobile.otherProduct}
              </Button>
            </div>
          </div>
        </>
      )}

      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={byBarcode} />
    </main>
  );
}
