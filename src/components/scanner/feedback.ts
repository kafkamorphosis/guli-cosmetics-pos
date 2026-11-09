let audio: AudioContext | null = null;

export function scanFeedback(ok: boolean): void {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = ok ? 1320 : 330;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (ok ? 0.08 : 0.25));
  } catch {
    // Audio can be blocked before the first user gesture; vibration still works.
  }
  navigator.vibrate?.(ok ? 40 : [60, 40, 60]);
}
