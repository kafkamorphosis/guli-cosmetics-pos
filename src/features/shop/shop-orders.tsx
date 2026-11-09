"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyOrderWithItems } from "@/lib/data/seller";
import { formatDateTime } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/domain/errors";
import { formatKrw } from "@/lib/domain/money";
import { formatOrderNo } from "@/lib/domain/order-no";
import { formatOrderTotal } from "@/lib/domain/order-total";
import type { OrderStatus } from "@/lib/domain/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { fetchOrders } from "./shop-api";

const STATUS: Partial<Record<OrderStatus, { label: string; tone: string }>> = {
  pending: { label: uz.shop.pending, tone: "bg-warn-soft text-warn" },
  new: { label: uz.shop.approved, tone: "bg-sand-soft text-ink" },
  ready: { label: uz.shop.ready, tone: "bg-sand-soft text-ink" },
  picked_up: { label: uz.shop.pickedUp, tone: "bg-ink text-cell" },
  cancelled: { label: uz.shop.cancelled, tone: "bg-danger-soft text-danger" },
};

export function ShopOrders({ initData }: { initData: string }) {
  const [orders, setOrders] = useState<MyOrderWithItems[] | null>(null);

  useEffect(() => {
    fetchOrders(initData)
      .then(setOrders)
      .catch((e) => toast.error(errorMessage(e)));
  }, [initData]);

  if (!orders) return <Skeleton className="m-3 h-60 rounded-none" />;
  if (orders.length === 0) return <p className="px-6 py-20 text-center text-ink-2">{uz.shop.ordersEmpty}</p>;

  return (
    <ul className="grid gap-3 p-3 pb-10">
      {orders.map((o) => {
        const s = STATUS[o.status];
        return (
          <li key={o.id} className="waybill">
            <div className="flex items-center justify-between gap-2 border-b border-ink px-3 py-2">
              <span className="font-bold">{uz.shop.orderNo(formatOrderNo(o.order_no))}</span>
              {s && <span className={cn("rounded-sm px-2 py-0.5 text-xs font-bold", s.tone)}>{s.label}</span>}
            </div>
            <ol className="divide-y divide-rule-soft">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-3 py-1.5 text-sm">
                  <span className="min-w-0">
                    {i.name} <span className="num text-ink-3">× {i.qty}</span>
                  </span>
                  <span className="num shrink-0">{formatKrw(i.line_total)}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-end justify-between gap-3 border-t border-ink px-3 py-2">
              <span className="text-xs text-ink-3">
                {formatDateTime(o.created_at)} · {uz.destination[o.destination ?? "KR"]}
              </span>
              <span className="text-right">
                <span className="caption block">{uz.shop.total}</span>
                <span className="num text-lg font-bold">{formatOrderTotal(o)}</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
