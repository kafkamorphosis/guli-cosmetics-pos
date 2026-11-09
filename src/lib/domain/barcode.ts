// USB scanners and camera decoders disagree on UPC-A (12 digits) vs EAN-13 (13 digits, leading 0).
export function barcodeCandidates(code: string): string[] {
  const c = code.trim();
  if (/^\d{12}$/.test(c)) return [c, "0" + c];
  if (/^0\d{12}$/.test(c)) return [c, c.slice(1)];
  return [c];
}
