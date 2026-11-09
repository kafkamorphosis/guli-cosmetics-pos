export const AUTH_EMAIL_DOMAIN = "gulicosmetics.local";

export function usernameToEmail(u: string): string {
  return `${u.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}
