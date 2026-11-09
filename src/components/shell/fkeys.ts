// Manager shortcuts: F1 Kassa, F2 Ombor, F3 Buyurtmalar, F4 Nasiya, F5 Tekpe (F9 checkout lives in Kassa).
const ROUTES: Record<string, string> = { F1: "/", F2: "/ombor", F3: "/buyurtmalar", F4: "/nasiya", F5: "/tekpe" };

export const F_KEYS: Record<string, string> = Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [r, k]));

export function fKeyRoute(key: string): string | null {
  return ROUTES[key] ?? null;
}
