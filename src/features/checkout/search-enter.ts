export type EnterDecision<P> = { kind: "pick"; product: P } | { kind: "barcode"; code: string } | { kind: "none" };

// What Enter in the Kassa search box should do. Suggestions arrive late (debounce + network), so the
// list on screen may belong to an older, shorter query; Korean barcodes share long prefixes, so a
// stale highlight is usually a *different* product of the same brand.
export function resolveEnter<P extends { barcode: string }>(s: {
  query: string;
  resultsFor: string;
  results: P[];
  active: number;
  navigated: boolean;
}): EnterDecision<P> {
  const q = s.query.trim();
  if (!q) return { kind: "none" };
  // A typed barcode goes through the barcode lookup (which also matches UPC-A/EAN-13 variants).
  if (/^\d{6,}$/.test(q)) return { kind: "barcode", code: q };
  const fresh = s.resultsFor.trim() === q;
  if (fresh) {
    const exact = s.results.find((p) => p.barcode === q);
    if (exact) return { kind: "pick", product: exact };
  }
  if ((fresh || s.navigated) && s.results[s.active]) return { kind: "pick", product: s.results[s.active] };
  return { kind: "none" };
}
