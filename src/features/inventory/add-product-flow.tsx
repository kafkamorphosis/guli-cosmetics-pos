"use client";

import { useState } from "react";
import { Archive, Camera, Loader2, RotateCcw, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { ProductThumb } from "@/components/product-thumb";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { scanFeedback } from "@/components/scanner/feedback";
import { useHidScanner } from "@/components/scanner/use-hid-scanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Product } from "@/lib/database.types";
import { findProductByBarcode } from "@/lib/data/products";
import { errorMessage } from "@/lib/domain/errors";
import { supabaseBrowser } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { ProductForm } from "./product-form";
import { RestockPanel } from "./restock-panel";

export type AddStep =
  | { kind: "scan" }
  | { kind: "restock"; product: Product }
  | { kind: "archived"; product: Product }
  | { kind: "new"; barcode: string };

// Archived products are looked up too: their barcode is taken, so the only way back is to restore them.
export async function lookupStep(code: string): Promise<AddStep> {
  const barcode = code.trim();
  const product = await findProductByBarcode(supabaseBrowser(), barcode, { includeArchived: true });
  if (!product) return { kind: "new", barcode };
  return product.is_archived ? { kind: "archived", product } : { kind: "restock", product };
}

function ArchivedPanel({ product, onRestored, onCancel }: { product: Product; onRestored(p: Product): void; onCancel(): void }) {
  const [busy, setBusy] = useState(false);
  async function restore() {
    setBusy(true);
    const { data, error } = await supabaseBrowser().from("products").update({ is_archived: false }).eq("id", product.id).select().single();
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(uz.inventory.restored);
    onRestored(data);
  }
  return (
    <div className="grid">
      <div className="flex items-center gap-3 border-b border-ink px-3 py-3">
        <ProductThumb path={product.photo_path} size={56} />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{product.name}</p>
          <p className="num text-sm text-ink-2">{product.barcode}</p>
        </div>
      </div>
      <div className="flex gap-3 border-b border-ink bg-warn-soft px-3 py-3 text-warn">
        <Archive className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{uz.inventory.archivedTitle}</p>
          <p className="text-sm">{uz.inventory.archivedHint}</p>
        </div>
      </div>
      <div className="dialog-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          {uz.common.cancel}
        </Button>
        <Button type="button" onClick={restore} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          {uz.inventory.restore}
        </Button>
      </div>
    </div>
  );
}

export function AddProductFlow({
  open,
  onOpenChange,
  onSaved,
  initialStep,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  onSaved(): void;
  initialStep?: AddStep;
}) {
  const [step, setStep] = useState<AddStep>(initialStep ?? { kind: "scan" });
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [camera, setCamera] = useState(false);

  function close() {
    onOpenChange(false);
    setStep({ kind: "scan" });
    setCode("");
  }

  async function lookup(raw: string) {
    const barcode = raw.trim();
    if (!barcode || looking) return;
    setCode(barcode);
    setLooking(true);
    try {
      setStep(await lookupStep(barcode));
      scanFeedback(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLooking(false);
    }
  }

  // The scanner stays live for the whole dialog so a scan never types into a field or presses
  // Enter on a form. Only the scan step uses it; elsewhere it is swallowed with a hint.
  function onScan(scanned: string) {
    if (step.kind === "scan") return void lookup(scanned);
    scanFeedback(false);
    toast.warning(uz.inventory.scanIgnored);
  }
  useHidScanner(onScan, { enabled: open && !camera });

  function done() {
    onSaved();
    close();
  }

  const title =
    step.kind === "restock"
      ? uz.inventory.restockTitle
      : step.kind === "new"
        ? uz.inventory.newProductTitle
        : step.kind === "archived"
          ? uz.inventory.archivedTitle
          : uz.inventory.add;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="gap-0 overflow-hidden border border-ink p-0 max-sm:max-h-dvh max-sm:overflow-y-auto sm:max-w-xl">
          <DialogHeader className="border-b border-ink px-4 py-3">
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </DialogHeader>

          {step.kind === "scan" && (
            <form
              className="grid"
              onSubmit={(e) => {
                e.preventDefault();
                lookup(code);
              }}
            >
              <div className="flex flex-col items-center gap-2 border-b border-ink px-4 py-8 text-center">
                <ScanBarcode className="size-10 text-ink-3" aria-hidden />
                <p className="text-base font-semibold">{uz.inventory.scanOrType}</p>
              </div>
              <label className="cell border-b border-ink">
                <span className="caption">{uz.inventory.barcode}</span>
                <span className="mt-1 flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoFocus
                    inputMode="numeric"
                    autoComplete="off"
                    className="num text-lg font-semibold tracking-wider"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => setCamera(true)} aria-label={uz.common.camera}>
                    <Camera aria-hidden />
                  </Button>
                </span>
              </label>
              <div className="dialog-actions">
                <Button type="button" variant="outline" onClick={close}>
                  {uz.common.cancel}
                </Button>
                <Button type="submit" disabled={!code.trim() || looking}>
                  {looking && <Loader2 className="animate-spin" aria-hidden />}
                  {uz.inventory.next}
                </Button>
              </div>
            </form>
          )}

          {step.kind === "restock" && (
            <RestockPanel product={step.product} onDone={done} onCancel={() => setStep({ kind: "scan" })} />
          )}
          {step.kind === "archived" && (
            <ArchivedPanel
              product={step.product}
              onRestored={(product) => {
                onSaved();
                setStep({ kind: "restock", product });
              }}
              onCancel={() => setStep({ kind: "scan" })}
            />
          )}
          {step.kind === "new" && (
            <ProductForm
              barcode={step.barcode}
              onSaved={done}
              onCancel={() => setStep({ kind: "scan" })}
              onExisting={(product) => setStep(product.is_archived ? { kind: "archived", product } : { kind: "restock", product })}
            />
          )}
        </DialogContent>
      </Dialog>
      <CameraScanner open={camera} onClose={() => setCamera(false)} onScan={(c) => onScan(c)} />
    </>
  );
}
