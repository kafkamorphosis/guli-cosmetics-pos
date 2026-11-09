import { Package } from "lucide-react";
import { photoUrl } from "@/lib/data/storage";
import { cn } from "@/lib/utils";

// Plain <img>: product photos are already resized to 800px on upload, and Vercel image
// optimisation would bill every thumbnail.
export function ProductThumb({ path, size = 40, className }: { path: string | null; size?: number; className?: string }) {
  const src = photoUrl(path);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule-soft bg-paper", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} loading="lazy" className="size-full object-cover" />
      ) : (
        <Package className="size-1/2 text-ink-3" aria-hidden />
      )}
    </span>
  );
}
