"use client";

import { Input } from "@/components/ui/input";
import type { PhoneCountry } from "@/lib/domain/phone";
import { cn } from "@/lib/utils";

const COUNTRIES: { code: PhoneCountry; label: string; prefix: string; placeholder: string }[] = [
  { code: "KR", label: "KR", prefix: "+82", placeholder: "010-1234-5678" },
  { code: "UZ", label: "UZ", prefix: "+998", placeholder: "90 123 45 67" },
];

export function PhoneField({
  country,
  onCountry,
  value,
  onChange,
  invalid,
  id,
}: {
  country: PhoneCountry;
  onCountry(c: PhoneCountry): void;
  value: string;
  onChange(v: string): void;
  invalid?: boolean;
  id?: string;
}) {
  const current = COUNTRIES.find((c) => c.code === country)!;
  return (
    <div className="flex items-stretch gap-2">
      <div role="radiogroup" aria-label="Davlat kodi" className="flex shrink-0 overflow-hidden rounded-sm border border-ink">
        {COUNTRIES.map((c, i) => (
          <button
            key={c.code}
            type="button"
            role="radio"
            aria-checked={country === c.code}
            onClick={() => onCountry(c.code)}
            className={cn(
              "num px-2.5 text-sm font-bold",
              i > 0 && "border-l border-ink",
              country === c.code ? "bg-ink text-cell" : "bg-cell text-ink hover:bg-paper",
            )}
          >
            {c.prefix}
          </button>
        ))}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder={current.placeholder}
        aria-invalid={invalid || undefined}
        className="num h-11 text-base"
      />
    </div>
  );
}
