export type CartProduct = {
  id: string;
  barcode: string;
  name: string;
  photoPath: string | null;
  retailPrice: number;
  wholesalePrice: number;
  weightG: number;
  stock: number;
};

export type CartLine = CartProduct & { qty: number; isWholesale: boolean };

export const MAX_QTY = 99_999;

export type CartAction =
  /** wholesale: the line's Optom choice when it is new (Hammasi optom is on). */
  | { type: "add"; product: CartProduct; wholesale?: boolean }
  | { type: "setQty"; id: string; qty: number }
  | { type: "inc"; id: string }
  | { type: "dec"; id: string }
  | { type: "toggleWholesale"; id: string }
  | { type: "setAllWholesale"; on: boolean }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "refresh"; ids: string[]; products: CartProduct[] };

function update(lines: CartLine[], id: string, fn: (l: CartLine) => CartLine): CartLine[] {
  return lines.map((l) => (l.id === id ? fn(l) : l));
}

export function cartReducer(lines: CartLine[], a: CartAction): CartLine[] {
  switch (a.type) {
    case "add": {
      const existing = lines.find((l) => l.id === a.product.id);
      // Refresh product data (price/stock may have changed) while bumping qty.
      if (existing) return update(lines, a.product.id, (l) => ({ ...l, ...a.product, qty: Math.min(MAX_QTY, l.qty + 1) }));
      return [...lines, { ...a.product, qty: 1, isWholesale: a.wholesale ?? false }];
    }
    case "setQty": {
      const qty = Math.floor(a.qty);
      if (!Number.isFinite(qty) || qty < 1) return lines.filter((l) => l.id !== a.id);
      return update(lines, a.id, (l) => ({ ...l, qty: Math.min(MAX_QTY, qty) }));
    }
    case "inc":
      return update(lines, a.id, (l) => ({ ...l, qty: Math.min(MAX_QTY, l.qty + 1) }));
    case "dec":
      return update(lines, a.id, (l) => ({ ...l, qty: Math.max(1, l.qty - 1) }));
    case "toggleWholesale":
      return update(lines, a.id, (l) => ({ ...l, isWholesale: !l.isWholesale }));
    case "setAllWholesale":
      return lines.map((l) => ({ ...l, isWholesale: a.on }));
    case "remove":
      return lines.filter((l) => l.id !== a.id);
    case "clear":
      return [];
    case "refresh": {
      // A restored cart takes today's prices and stock. Only the lines that were asked about can drop
      // out (their product is gone); anything scanned while the request was in flight is kept.
      const asked = new Set(a.ids);
      const byId = new Map(a.products.map((p) => [p.id, p]));
      return lines
        .filter((l) => !asked.has(l.id) || byId.has(l.id))
        .map((l) => (byId.has(l.id) ? { ...l, ...byId.get(l.id)! } : l));
    }
  }
}

export function unitPrice(l: CartLine): number {
  return l.isWholesale ? l.wholesalePrice : l.retailPrice;
}

export function isOverStock(l: CartLine): boolean {
  return l.qty > l.stock;
}

export function cartTotals(lines: CartLine[]) {
  return lines.reduce(
    (t, l) => ({
      lineCount: t.lineCount + 1,
      itemCount: t.itemCount + l.qty,
      totalWeightG: t.totalWeightG + l.weightG * l.qty,
      subtotal: t.subtotal + unitPrice(l) * l.qty,
    }),
    { lineCount: 0, itemCount: 0, totalWeightG: 0, subtotal: 0 },
  );
}
