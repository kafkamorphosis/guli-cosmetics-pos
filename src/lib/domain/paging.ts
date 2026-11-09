// A refreshed first page replaces its rows in a longer, already-paged list (newest first) without
// dropping the older pages the user loaded.
export function mergeFresh<T extends { id: string; created_at: string }>(loaded: T[] | null, fresh: T[]): T[] {
  if (!loaded) return fresh;
  const freshIds = new Set(fresh.map((r) => r.id));
  return [...fresh, ...loaded.filter((r) => !freshIds.has(r.id))].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
