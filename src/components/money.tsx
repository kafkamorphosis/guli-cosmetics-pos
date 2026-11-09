import { formatKrw, formatUsd, formatWeight } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export function Krw({ value, className }: { value: number; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatKrw(value)}</span>;
}

export function Usd({ value, className }: { value: number; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatUsd(value)}</span>;
}

export function Weight({ grams, className }: { grams: number; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatWeight(grams)}</span>;
}
