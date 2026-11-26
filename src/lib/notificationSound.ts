export type SoundStatus = "locked" | "enabled" | "muted" | "unsupported";
const MUTED_KEY = "santuario-astral:notification-muted";

/** AudioContext is constructed/resumed only by the caller's user gesture. */
export function createNotificationSound(changed: (status: SoundStatus) => void) {
  let context: AudioContext | null = null;
  let disposed = false;
  let muted = false;
  let lastPlayed = -Infinity;
  try { muted = window.localStorage.getItem(MUTED_KEY) === "true"; } catch { /* Optional preference. */ }
  let status: SoundStatus = muted ? "muted" : "locked";
  const report = () => {
    status = muted ? "muted" : context?.state === "running" ? "enabled" : "locked";
    if (!disposed) changed(status);
  };
  const enable = async (automatic = false) => {
    if (disposed || (automatic && muted)) return false;
    try {
      const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) { status = "unsupported"; changed(status); return false; }
      muted = false;
      try { window.localStorage.setItem(MUTED_KEY, "false"); } catch { /* Optional preference. */ }
      if (!context || context.state === "closed") {
        context = new Constructor();
        context.onstatechange = report;
      }
      if (context.state !== "running") await context.resume();
      if (disposed) return false;
      report();
      return status === "enabled";
    } catch { report(); return false; }
  };
  changed(status);
  return {
    enable,
    mute() {
      muted = true;
      try { window.localStorage.setItem(MUTED_KEY, "true"); } catch { /* Optional preference. */ }
      report();
    },
    play(role: "cliente" | "maestro") {
      if (disposed || muted || !context || context.state !== "running") { report(); return false; }
      const now = context.currentTime;
      if (now - lastPlayed < 0.75) return false;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(role === "maestro" ? 660 : 520, now);
        oscillator.frequency.setValueAtTime(role === "maestro" ? 880 : 660, now + 0.12);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(role === "maestro" ? 0.06 : 0.035, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(now);
        oscillator.stop(now + 0.34);
        lastPlayed = now;
        return true;
      } catch { report(); return false; }
    },
    dispose() {
      disposed = true;
      if (context) {
        context.onstatechange = null;
        void context.close().catch(() => {});
      }
    },
  };
}
