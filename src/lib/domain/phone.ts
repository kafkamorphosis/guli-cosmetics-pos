import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneCountry = "KR" | "UZ";

export function normalizePhone(raw: string, country: PhoneCountry): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
