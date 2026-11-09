import { uz } from "@/lib/i18n/uz";

export function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function validateUsername(u: string): string | null {
  return /^[a-z0-9._-]{3,32}$/.test(normalizeUsername(u)) ? null : uz.admin.usernameRule;
}

export function validatePassword(p: string): string | null {
  return p.length >= 8 ? null : uz.admin.passwordRule;
}
