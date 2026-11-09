import { TIME_ZONE } from "./dates";

export type PeriodKind = "day" | "week" | "month" | "year";

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

// Calendar math on Y-M-D strings via UTC dates. Seoul has no daylight saving time, so every Seoul
// day is exactly [00:00+09:00, next 00:00+09:00).
function toDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

function seoulMidnight(ymd: string): string {
  return `${ymd}T00:00:00+09:00`;
}

const todayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function seoulToday(now: Date = new Date()): string {
  return todayFormat.format(now);
}

function periodStart(kind: PeriodKind, ymd: string): string {
  const d = toDate(ymd);
  if (kind === "day") return ymd;
  if (kind === "week") return addDays(ymd, -((d.getUTCDay() + 6) % 7)); // Monday
  if (kind === "month") return `${ymd.slice(0, 7)}-01`;
  return `${ymd.slice(0, 4)}-01-01`;
}

function nextStart(kind: PeriodKind, start: string): string {
  const d = toDate(start);
  if (kind === "day") return addDays(start, 1);
  if (kind === "week") return addDays(start, 7);
  if (kind === "month") return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  return `${d.getUTCFullYear() + 1}-01-01`;
}

function prevStart(kind: PeriodKind, start: string): string {
  const d = toDate(start);
  if (kind === "day") return addDays(start, -1);
  if (kind === "week") return addDays(start, -7);
  if (kind === "month") return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)));
  return `${d.getUTCFullYear() - 1}-01-01`;
}

export function periodRange(kind: PeriodKind, anchorYmd: string) {
  const startYmd = periodStart(kind, anchorYmd);
  const next = nextStart(kind, startYmd);
  return { from: seoulMidnight(startYmd), to: seoulMidnight(next), startYmd, endYmd: addDays(next, -1) };
}

export function shiftPeriod(kind: PeriodKind, anchorYmd: string, dir: -1 | 1): string {
  const start = periodStart(kind, anchorYmd);
  return dir === 1 ? nextStart(kind, start) : prevStart(kind, start);
}

function dmy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

export function periodLabel(kind: PeriodKind, anchorYmd: string): string {
  const { startYmd, endYmd } = periodRange(kind, anchorYmd);
  if (kind === "day") return dmy(startYmd);
  if (kind === "week") return `${dmy(startYmd).slice(0, 5)} – ${dmy(endYmd)}`;
  if (kind === "month") return `${MONTHS[Number(startYmd.slice(5, 7)) - 1]} ${startYmd.slice(0, 4)}`;
  return startYmd.slice(0, 4);
}
