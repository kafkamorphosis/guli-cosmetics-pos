"use client";

import { useEffect } from "react";

// Prints once every image on the sheet (logos, photos, QR) has loaded.
export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const pending = [...document.images].filter((img) => !img.complete).map((img) => img.decode().catch(() => undefined));
    Promise.all(pending).then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return null;
}
