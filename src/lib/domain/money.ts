function groupThousands(n: number): string {
  const [int, frac] = Math.abs(n).toString().split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (n < 0 ? "-" : "") + grouped + (frac ? "," + frac : "");
}

function trimDecimals(n: number, digits: number): number {
  return Number(n.toFixed(digits));
}

export function formatKrw(n: number): string {
  return `${groupThousands(Math.round(n))} ₩`;
}

export function formatUsd(n: number): string {
  return `${groupThousands(trimDecimals(n, 2))} $`;
}

export function formatKg(g: number): string {
  return `${groupThousands(trimDecimals(g / 1000, 2))} kg`;
}

export function formatWeight(g: number): string {
  return g < 1000 ? `${groupThousands(g)} g` : formatKg(g);
}
