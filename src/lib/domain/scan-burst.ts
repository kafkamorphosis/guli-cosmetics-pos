export type BurstResult = { preventDefault: boolean; burstStart: boolean; scan: string | null };

const NONE: BurstResult = { preventDefault: false, burstStart: false, scan: null };

// USB barcode scanners "type" a code as a burst of keystrokes a few ms apart, then Enter.
// Humans rarely type that fast, so the gap between keys tells the two apart.
// Inside a text field nothing but the scan's Enter is ever blocked: a fast typist's overlapping
// keys must not vanish. The caller puts the field back the way it was when a scan completes.
export function createScanBurstDetector(opts: { maxGapMs?: number; minLength?: number } = {}) {
  const maxGapMs = opts.maxGapMs ?? 35;
  const minLength = opts.minLength ?? 4;
  let buffer = "";
  let lastTime = -Infinity;

  return {
    handleKey(key: string, timeMs: number, inField = false): BurstResult {
      if (key === "Shift") return NONE;
      if (key.length === 1) {
        const continues = buffer.length > 0 && timeMs - lastTime <= maxGapMs;
        lastTime = timeMs;
        if (continues) {
          buffer += key;
          return { preventDefault: !inField, burstStart: false, scan: null };
        }
        buffer = key;
        return { preventDefault: false, burstStart: true, scan: null };
      }
      const code = buffer;
      const recent = timeMs - lastTime <= maxGapMs * 3;
      buffer = "";
      if (key === "Enter" && code.length >= minLength && recent) {
        return { preventDefault: true, burstStart: false, scan: code };
      }
      return NONE;
    },
  };
}
