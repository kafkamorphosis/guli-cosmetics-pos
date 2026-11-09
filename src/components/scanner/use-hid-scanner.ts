"use client";

import { useEffect, useEffectEvent } from "react";
import { createScanBurstDetector } from "@/lib/domain/scan-burst";

type Field = HTMLInputElement | HTMLTextAreaElement;

function isField(t: EventTarget | null): t is Field {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

function restoreValue(el: Field, value: string) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Listens page-wide for USB barcode scanner bursts. If the burst lands in a text field,
// the field's text is put back the way it was and the code goes to onScan instead.
export function useHidScanner(onScan: (code: string) => void, opts: { enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true;
  const handleScan = useEffectEvent(onScan);

  useEffect(() => {
    if (!enabled) return;
    const detector = createScanBurstDetector();
    let origin: { el: Field; value: string } | null = null;

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const r = detector.handleKey(e.key, e.timeStamp, isField(e.target));
      if (r.burstStart) origin = isField(e.target) ? { el: e.target, value: e.target.value } : null;
      if (r.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (r.scan) {
        if (origin && origin.el.value !== origin.value) restoreValue(origin.el, origin.value);
        origin = null;
        handleScan(r.scan);
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [enabled]);
}
