"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createScanConfirmer } from "@/lib/domain/scan-confirm";
import { uz } from "@/lib/i18n/uz";

// No Code 39: decoders "find" it in the bars of EAN-13 labels, and cosmetics never use it.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] as const;

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string; format?: string }[]> };

async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (Native) {
    const supported = await Native.getSupportedFormats();
    if (supported.includes("ean_13") && supported.includes("qr_code")) return new Native({ formats: [...FORMATS] });
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export function CameraScanner({
  open,
  onClose,
  onScan,
  continuous = false,
  title = uz.scanner.title,
}: {
  open: boolean;
  onClose(): void;
  onScan(code: string): void;
  continuous?: boolean;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handleScan = useEffectEvent(onScan);
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    // Two matching reads in a row, like a hardware scanner; the caller beeps once it knows the result.
    const accept = createScanConfirmer({ frames: 2, repeatMs: 1500 });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) {
          // Closed while the permission prompt was open: release the camera we just got.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const detector = await createDetector();
        let last = 0;
        const tick = async (t: number) => {
          if (stopped) return;
          if (t - last > 90 && video.readyState >= 2) {
            last = t;
            try {
              const codes = await detector.detect(video);
              const code = codes[0]?.rawValue?.trim();
              if (code && !stopped && accept(code, performance.now(), codes[0].format)) {
                handleScan(code);
                if (!continuous) {
                  handleClose();
                  return;
                }
              }
            } catch {
              // A single failed frame is fine; keep scanning.
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(name === "NotAllowedError" ? uz.scanner.permissionDenied : uz.scanner.unavailable);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, continuous]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        setError(null);
        onClose();
      }}
    >
      <DialogContent className="max-sm:h-dvh max-sm:max-w-full max-sm:rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{continuous ? uz.scanner.hintContinuous : uz.scanner.hint}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-4 text-destructive">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
