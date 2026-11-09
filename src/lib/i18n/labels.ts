import type { Destination, OrderType } from "@/lib/domain/types";
import { uz } from "./uz";

export function orderTypeLabel(o: { type: OrderType; destination: Destination | null }): string {
  return o.type === "tekpe" && o.destination ? `${uz.orderType.tekpe} · ${uz.destination[o.destination]}` : uz.orderType.store;
}
