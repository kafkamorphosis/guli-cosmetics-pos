// Scanner beep + buzz. Inside the Android app the phone makes the sound itself (works even before
// the first tap, and through the media volume); in a browser it is a short Web Audio tone.

type AndroidBridge = { beep?(ok: boolean): void };

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

// Browsers only start audio after a user gesture; wake the context on the first tap so the
// first scan already beeps.
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => context(), { once: true, capture: true });
}

function tone(ctx: AudioContext, freq: number, start: number, length: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.005);
  gain.gain.setValueAtTime(0.18, start + length - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.01);
}

export function scanFeedback(ok: boolean): void {
  const android = (globalThis as { GuliAndroid?: AndroidBridge }).GuliAndroid;
  if (android?.beep) {
    try {
      android.beep(ok);
      return;
    } catch {
      // Old app without the beep: fall through to the browser sound.
    }
  }
  const ctx = context();
  if (ctx) {
    const t = ctx.currentTime;
    if (ok) tone(ctx, 2700, t, 0.12);
    else {
      tone(ctx, 400, t, 0.15);
      tone(ctx, 400, t + 0.22, 0.15);
    }
  }
  navigator.vibrate?.(ok ? 40 : [60, 40, 60]);
}
