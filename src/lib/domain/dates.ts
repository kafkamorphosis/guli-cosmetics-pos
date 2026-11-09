export const TIME_ZONE = "Asia/Seoul";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatDateTime(iso: string): string {
  const parts = Object.fromEntries(
    dateTimeFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

// Korea has no daylight saving time, so a Seoul day is always [00:00+09:00, next 00:00+09:00).
export function seoulDayStart(ymd: string): string {
  return `${ymd}T00:00:00+09:00`;
}

export function seoulDayEndExclusive(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return seoulDayStart(d.toISOString().slice(0, 10));
}
