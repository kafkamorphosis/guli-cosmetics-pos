import { uz } from "@/lib/i18n/uz";

export type ErrorCode = keyof typeof uz.errors;

export function errorMessage(e: unknown): string {
  const message = typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : "";
  return message in uz.errors ? uz.errors[message as ErrorCode] : uz.common.genericError;
}
