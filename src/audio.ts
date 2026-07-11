export type SfxId = "dash" | "levelUp" | "clear" | "gameOver" | "coin";
// Planned additive members (post-P5): "shieldGet" | "shieldBreak"

/** Web Audio sound effects generated in code; no external files needed. */
export function createSfx() {
  let audio: AudioContext | null = null;

  const tone = (
    freq: number,
    duration: number,
    type: OscillatorType,
    opts: { to?: number; at?: number; volume?: number } = {},
  ) => {
    if (!audio) {
      return;
    }
    const t0 = audio.currentTime + (opts.at ?? 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + duration);
    }
    gain.gain.setValueAtTime(opts.volume ?? 0.07, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  };

  return {
    /** Create/resume the context; must be called from a user gesture. */
    unlock() {
      if (!audio) {
        audio = new AudioContext();
      }
      if (audio.state === "suspended") {
        void audio.resume();
      }
    },
    dash() {
      tone(240, 0.12, "square", { to: 90, volume: 0.05 });
    },
    levelUp() {
      tone(523.25, 0.12, "square");
      tone(659.25, 0.12, "square", { at: 0.09 });
      tone(783.99, 0.22, "square", { at: 0.18 });
    },
    clear() {
      tone(523.25, 0.5, "triangle");
      tone(659.25, 0.5, "triangle", { at: 0.12 });
      tone(783.99, 0.5, "triangle", { at: 0.24 });
      tone(1046.5, 0.8, "triangle", { at: 0.36, volume: 0.09 });
    },
    gameOver() {
      tone(320, 0.7, "sawtooth", { to: 55, volume: 0.09 });
    },
    coin() {
      tone(1318.51, 0.05, "square", { volume: 0.05 });
      tone(1975.53, 0.05, "square", { at: 0.04, volume: 0.05 });
    },
    dispose() {
      if (audio && audio.state !== "closed") {
        void audio.close();
      }
      audio = null;
    },
  };
}
