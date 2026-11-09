export function formatOrderNo(n: number): string {
  return "#" + n.toString().padStart(6, "0");
}

export function formatBoxNo(n: number): string {
  return "#Q" + n.toString().padStart(4, "0");
}
