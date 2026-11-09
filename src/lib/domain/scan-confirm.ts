// Camera decoders sometimes read a phantom code off one blurry frame (half an EAN-13 read as an
// EAN-8, say). A hardware scanner never does that, so the camera has to earn each scan: the same
// code in consecutive reads, with a valid check digit when it is an EAN/UPC.

function checkDigitOk(digits: string): boolean {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Weights alternate 3,1,… from the digit next to the check digit.
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

function upcEToUpcA(e: string): string | null {
  if (!/^[01]\d{7}$/.test(e)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = e;
  const middle =
    d6 <= "2" ? `${d1}${d2}${d6}0000${d3}${d4}${d5}` :
    d6 === "3" ? `${d1}${d2}${d3}00000${d4}${d5}` :
    d6 === "4" ? `${d1}${d2}${d3}${d4}00000${d5}` :
    `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${ns}${middle}${check}`;
}

// Formats whose last digit is a GTIN check digit. Code 128 and others carry no such digit, so a
// numeric in-store label must not be checked as if it were an EAN.
const GTIN_FORMATS = new Set(["ean_13", "ean_8", "upc_a", "upc_e", "itf"]);

/** `format` is the decoder's format name; without one, numeric codes are checked by length. */
export function isPlausibleBarcode(code: string, format?: string): boolean {
  const c = code.trim();
  if (c.length < 3) return false;
  if (!/^\d+$/.test(c)) return true;
  if (format !== undefined && !GTIN_FORMATS.has(format)) return true;
  if (c.length === 8) {
    const upcA = upcEToUpcA(c);
    return checkDigitOk(c) || (upcA !== null && checkDigitOk(upcA));
  }
  if (c.length === 12 || c.length === 13 || c.length === 14) return checkDigitOk(c);
  return true;
}

export function createScanConfirmer({ frames, repeatMs }: { frames: number; repeatMs: number }) {
  let candidate: string | null = null;
  let count = 0;
  let accepted: string | null = null;
  let acceptedSeen = -Infinity;

  return (code: string, timeMs: number, format?: string): boolean => {
    if (!isPlausibleBarcode(code, format)) {
      candidate = null;
      count = 0;
      return false;
    }
    // Still pointed at the code just accepted: keep quiet until it has been out of view a while.
    if (code === accepted && timeMs - acceptedSeen < repeatMs) {
      acceptedSeen = timeMs;
      return false;
    }
    if (code === candidate) count++;
    else {
      candidate = code;
      count = 1;
    }
    if (count < frames) return false;
    accepted = code;
    acceptedSeen = timeMs;
    candidate = null;
    count = 0;
    return true;
  };
}
