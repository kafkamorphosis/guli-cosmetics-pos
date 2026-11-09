import type { OrderStatus } from "@/lib/domain/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const STYLE: Record<OrderStatus, string> = {
  completed: "border-ok/40 bg-ok-soft text-ok",
  pending: "border-warn/40 bg-warn-soft text-warn",
  new: "border-ink bg-sand text-sand-ink",
  ready: "border-ink bg-ink text-cell",
  picked_up: "border-rule-soft bg-paper text-ink-2",
  cancelled: "border-danger/40 bg-danger-soft text-danger line-through decoration-1",
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm border px-2 text-xs font-bold tracking-wide whitespace-nowrap uppercase",
        STYLE[status],
        className,
      )}
    >
      {uz.status[status]}
    </span>
  );
}
