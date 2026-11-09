import type { Destination, OrderType, PaymentMethod } from "@/lib/domain/types";

export type Payload = {
  items: { product_id: string; qty: number; is_wholesale: boolean }[];
  type: OrderType;
  destination: Destination | null;
  phone: string | null;
  name: string | null;
  payment: PaymentMethod;
  city?: string;
  district?: string;
};

export type StoredRequest = { id: string; fp: string } | null;

export type RequestDecision<O> = { kind: "new"; id: string } | { kind: "reuse"; id: string } | { kind: "placed"; order: O };

// What the order would contain, independent of line order. A retry is only a retry if this matches.
export function cartFingerprint(p: Payload): string {
  const items = [...p.items].sort((a, b) => a.product_id.localeCompare(b.product_id));
  return JSON.stringify({ ...p, items });
}

// The idempotency key protects a retry of the *same* order. If the cart changed after an attempt
// whose outcome is unknown, ask the server whether that attempt landed before minting a new key:
// silently reusing the key would return the old order and drop the edits.
export async function resolveRequest<O>(
  stored: StoredRequest,
  fp: string,
  findOrder: (requestId: string) => Promise<O | null>,
  newId: () => string,
): Promise<RequestDecision<O>> {
  if (!stored) return { kind: "new", id: newId() };
  if (stored.fp === fp) return { kind: "reuse", id: stored.id };
  const order = await findOrder(stored.id);
  return order ? { kind: "placed", order } : { kind: "new", id: newId() };
}
