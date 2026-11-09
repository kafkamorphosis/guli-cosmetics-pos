"use client";

import { toast } from "sonner";
import { uz } from "@/lib/i18n/uz";

declare global {
  interface Window {
    // printBox exists from desktop 0.2.0; older installs print box lists through the dialog.
    guliDesktop?: { print(orderId: string): Promise<void>; printBox?(boxId: string): Promise<void> };
  }
}

// Desktop .exe (Phase 2) prints silently; browsers get their print dialog.
export function printOrder(orderId: string): void {
  if (window.guliDesktop) {
    window.guliDesktop.print(orderId).catch(() => toast.error(uz.common.printFailed));
    return;
  }
  printPage(`/print/${orderId}?autoprint=1`);
}

export function printBox(boxId: string): void {
  if (window.guliDesktop?.printBox) {
    window.guliDesktop.printBox(boxId).catch(() => toast.error(uz.common.printFailed));
    return;
  }
  printPage(`/print/box/${boxId}?autoprint=1`);
}

function printPage(url: string): void {
  // Phones and tablets handle printing a hidden frame poorly; give them the sheet in a tab.
  if (window.matchMedia("(pointer: coarse)").matches) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = url;
  frame.addEventListener("load", () => {
    frame.contentWindow?.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500));
  });
  document.body.appendChild(frame);
}
