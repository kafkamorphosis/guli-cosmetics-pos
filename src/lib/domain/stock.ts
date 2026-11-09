const MAX_STOCK = 2_000_000_000;

// The quantity to write when Tahrirlash is saved: null when the field is blank or unchanged.
export function stockToSave(original: number, draft: string): number | null {
  const text = draft.trim();
  if (!text) return null;
  const next = Math.min(Math.max(Math.trunc(Number(text)) || 0, 0), MAX_STOCK);
  return next === original ? null : next;
}

// −10 / +10 in the edit form: changes the field only, never below zero.
export function stepStock(draft: string, delta: number): string {
  return String(Math.min(Math.max((Number(draft.trim()) || 0) + delta, 0), MAX_STOCK));
}
