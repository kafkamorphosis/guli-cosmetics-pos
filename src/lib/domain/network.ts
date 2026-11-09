// Longest a checkout request may hang before the seller gets the retry banner.
export const REQUEST_TIMEOUT_MS = 15_000;

// True when a request never got a server answer (offline, dropped, timed out) — the cases where
// a retry with the same idempotency key is the right move. Server errors carry a code; bugs don't
// look like fetch failures.
export function isNetworkError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const { name, message, code } = e as { name?: string; message?: string; code?: string };
  if (name === "AbortError" || name === "TimeoutError") return true;
  if (code) return false;
  return /failed to fetch|load failed|networkerror|network request failed/i.test(message ?? "");
}
