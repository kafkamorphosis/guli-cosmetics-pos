import type { Destination, OrderStatus } from "./types";

export type BoxGroupOrder = {
  id: string;
  created_at: string;
  status: OrderStatus;
  destination: Destination | null;
  box_id: string | null;
  box_no: number | null;
  box_status: "open" | "closed" | "picked_up" | null;
};

export type BoxGroup<T extends BoxGroupOrder> = {
  key: string;
  kind: "pending" | "open" | "closed" | "other";
  boxNo: number | null;
  orders: T[];
};

const RANK = { pending: 0, open: 1, closed: 2, other: 3 } as const;

// A seller's orders for one country, the way their boxes arrive: waiting for approval, the box
// being filled, packed boxes (newest first), then cancelled orders.
export function groupByBox<T extends BoxGroupOrder>(orders: T[], destination: Destination): BoxGroup<T>[] {
  const groups = new Map<string, BoxGroup<T>>();
  for (const order of orders) {
    if (order.destination !== destination) continue;
    const kind: BoxGroup<T>["kind"] =
      order.status === "pending" ? "pending" : order.box_id ? (order.box_status === "open" ? "open" : "closed") : "other";
    const key = order.box_id ?? kind;
    const group = groups.get(key) ?? { key, kind, boxNo: order.box_no, orders: [] };
    group.orders.push(order);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  for (const g of list) g.orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return list.sort((a, b) => RANK[a.kind] - RANK[b.kind] || (b.boxNo ?? 0) - (a.boxNo ?? 0));
}
