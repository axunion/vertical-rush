export type SfxId =
  | "dash"
  | "levelUp"
  | "clear"
  | "gameOver"
  | "coin"
  | "shieldGet"
  | "shieldBreak";

/** AUD-03: BGM tempo per zone id (ZONE_TABLE keys); key stays C major throughout. */
const BGM_TEMPO: Record<string, number> = {
  "old-town": 112,
  "market-street": 126,
  "castle-road": 140,
};

const BGM_MASTER_GAIN = 0.04;
const BGM_LOOKAHEAD_MS = 25;
const BGM_SCHEDULE_AHEAD_SEC = 0.1;
const BGM_STEPS_PER_BAR = 4;
const C4 = 261.63;

/** AUD-04: per-zone ambient layer, all procedural. Fade time on zone switch/stop. */
const AMBIENT_FADE_SEC = 0.5;
const AMBIENT_LOOP_BUFFER_SEC = 2;
/** Bird blips fire every 4-9s (spec); banner flaps every 3-6s (unspecified by spec, tuned by ear). */
const BIRD_BLIP_DELAY_MIN_MS = 4000;
const BIRD_BLIP_DELAY_RANGE_MS = 5000;
const BANNER_FLAP_DELAY_MIN_MS = 3000;
const BANNER_FLAP_DELAY_RANGE_MS = 3000;

/** Semitone offsets from C4 for a pleasant 8-bar C-major lead line (4 beats/bar); `null` is a rest. */
const BGM_LEAD: readonly (number | null)[] = [
  0,
  4,
  7,
  4,
  0,
  4,
  7,
  9,
  7,
  4,
  0,
  4,
  5,
  4,
  2,
  0,
  0,
  4,
  7,
  4,
  0,
  4,
  7,
  9,
  7,
  5,
  4,
  2,
  0,
  null,
  0,
  null,
];

/** One sustained root per bar (I-I-IV-V-vi-IV-I-I), semitones from C4, played an octave down. */
const BGM_BASS: readonly number[] = [0, 0, 5, 7, 9, 5, 0, 0];

function noteFreq(semitoneOffset: number): number {
  return C4 * 2 ** (semitoneOffset / 12);
}

/** Web Audio sound effects generated in code; no external files needed. */
export function createSfx() {
  let audio: AudioContext | null = null;
  let bgmTimer: number | null = null;
  let bgmMasterGain: GainNode | null = null;
  let bgmNextStepTime = 0;
  let bgmStep = 0;
  let bgmBpm = BGM_TEMPO["old-town"];
  let ambientZone: string | null = null;
  let ambientTimer: number | null = null;
  let ambientLoopSource: AudioBufferSourceNode | null = null;
  let ambientLoopGain: GainNode | null = null;

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

  /** ~0.2s of white noise, gated by an exponential-decay envelope — the crash pratfall (AUD-02 gameOver). */
  const noiseBurst = (duration: number, volume: number) => {
    if (!audio) {
      return;
    }
    const frameCount = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const gain = audio.createGain();
    const t0 = audio.currentTime;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(gain).connect(audio.destination);
    source.start(t0);
  };

  /** One BGM note: linear attack (avoids a click), exponential decay, routed through the shared master gain. */
  const bgmNote = (
    freq: number,
    duration: number,
    type: OscillatorType,
    peakVolume: number,
    startTime: number,
  ) => {
    if (!audio || !bgmMasterGain) {
      return;
    }
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain).connect(bgmMasterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  };

  const playBgmStep = (step: number, time: number) => {
    const secPerStep = 60 / bgmBpm;
    const leadDegree = BGM_LEAD[step % BGM_LEAD.length];
    if (leadDegree !== null) {
      bgmNote(noteFreq(leadDegree), secPerStep * 0.9, "square", 0.05, time);
    }
    if (step % BGM_STEPS_PER_BAR === 0) {
      const bar = Math.floor(step / BGM_STEPS_PER_BAR) % BGM_BASS.length;
      bgmNote(
        noteFreq(BGM_BASS[bar] - 12),
        secPerStep * BGM_STEPS_PER_BAR * 0.95,
        "triangle",
        0.06,
        time,
      );
    }
  };

  /** The standard two-timer look-ahead scheduler: a coarse `setInterval` schedules exact-time notes a little ahead of `currentTime`. */
  const scheduleBgm = () => {
    if (!audio) {
      return;
    }
    while (bgmNextStepTime < audio.currentTime + BGM_SCHEDULE_AHEAD_SEC) {
      playBgmStep(bgmStep, bgmNextStepTime);
      bgmNextStepTime += 60 / bgmBpm;
      bgmStep = (bgmStep + 1) % BGM_LEAD.length;
    }
  };

  /** A short filtered noise transient — banner flap uses this in place of the plain `noiseBurst`. */
  const filteredNoiseBurst = (
    duration: number,
    volume: number,
    filterType: BiquadFilterType,
    freq: number,
  ) => {
    if (!audio) {
      return;
    }
    const frameCount = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = audio.createGain();
    const t0 = audio.currentTime;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start(t0);
  };

  /** A continuous looping filtered-noise bed (market-street murmur, castle-road wind); fades in over `AMBIENT_FADE_SEC`. */
  const startAmbientLoop = (
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    peakVolume: number,
  ) => {
    if (!audio) {
      return;
    }
    const frameCount = Math.floor(audio.sampleRate * AMBIENT_LOOP_BUFFER_SEC);
    const buffer = audio.createBuffer(1, frameCount, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = audio.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(
      peakVolume,
      audio.currentTime + AMBIENT_FADE_SEC,
    );
    source.connect(filter).connect(gain).connect(audio.destination);
    source.start();
    ambientLoopSource = source;
    ambientLoopGain = gain;
  };

  /** Fades out and tears down the current ambient loop, if any. */
  const stopAmbientLoop = () => {
    if (!audio || !ambientLoopSource || !ambientLoopGain) {
      ambientLoopSource = null;
      ambientLoopGain = null;
      return;
    }
    const source = ambientLoopSource;
    const gain = ambientLoopGain;
    gain.gain.linearRampToValueAtTime(
      0.0001,
      audio.currentTime + AMBIENT_FADE_SEC,
    );
    setTimeout(
      () => {
        source.stop();
        source.disconnect();
        gain.disconnect();
      },
      AMBIENT_FADE_SEC * 1000 + 50,
    );
    ambientLoopSource = null;
    ambientLoopGain = null;
  };

  const clearAmbientTimer = () => {
    if (ambientTimer !== null) {
      window.clearTimeout(ambientTimer);
      ambientTimer = null;
    }
  };

  /** old-town: sparse two-note sine bird blip, rescheduled every 4-9s. */
  const scheduleBirdBlip = () => {
    ambientTimer = window.setTimeout(
      () => {
        tone(1800, 0.07, "sine", { volume: 0.025 });
        tone(2400, 0.06, "sine", { at: 0.08, volume: 0.02 });
        scheduleBirdBlip();
      },
      BIRD_BLIP_DELAY_MIN_MS + Math.random() * BIRD_BLIP_DELAY_RANGE_MS,
    );
  };

  /** castle-road: a banner-flap transient over the wind bed, rescheduled every 3-6s. */
  const scheduleBannerFlap = () => {
    ambientTimer = window.setTimeout(
      () => {
        filteredNoiseBurst(0.12, 0.03, "bandpass", 700);
        scheduleBannerFlap();
      },
      BANNER_FLAP_DELAY_MIN_MS + Math.random() * BANNER_FLAP_DELAY_RANGE_MS,
    );
  };

  /** Starts the layer(s) for `zoneId`; a no-op for any zone id without an ambient layer defined. */
  const beginZoneAmbient = (zoneId: string) => {
    if (zoneId === "old-town") {
      scheduleBirdBlip();
      return;
    }
    if (zoneId === "market-street") {
      startAmbientLoop("bandpass", 1000, 1.2, 0.018);
      return;
    }
    if (zoneId === "castle-road") {
      startAmbientLoop("lowpass", 500, 0.7, 0.02);
      scheduleBannerFlap();
    }
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
      tone(523.25, 1.2, "sine", { at: 0.36, volume: 0.05 }); // low bell (AUD-02)
    },
    gameOver() {
      tone(320, 0.7, "sawtooth", { to: 55, volume: 0.09 });
      noiseBurst(0.2, 0.08); // pratfall noise burst (AUD-02)
    },
    coin() {
      tone(1318.51, 0.05, "square", { volume: 0.05 });
      tone(1975.53, 0.05, "square", { at: 0.04, volume: 0.05 });
    },
    /** AUD-02 (P11): warm major chord for picking up a shield (sweet-roll). */
    shieldGet() {
      tone(523.25, 0.2, "triangle", { volume: 0.06 });
      tone(659.25, 0.2, "triangle", { volume: 0.06 });
      tone(783.99, 0.24, "triangle", { volume: 0.06 });
    },
    /** AUD-02 (P11): glass-pop for a shield absorbing a hit. */
    shieldBreak() {
      tone(900, 0.1, "sine", { to: 300, volume: 0.06 });
      noiseBurst(0.05, 0.05);
    },
    /** AUD-03: starts the procedural chip loop at `zoneId`'s tempo; a no-op if already playing. */
    startBgm(zoneId: string) {
      if (!audio || bgmTimer !== null) {
        return;
      }
      bgmMasterGain = audio.createGain();
      bgmMasterGain.gain.value = BGM_MASTER_GAIN;
      bgmMasterGain.connect(audio.destination);
      bgmBpm = BGM_TEMPO[zoneId] ?? BGM_TEMPO["old-town"];
      bgmStep = 0;
      bgmNextStepTime = audio.currentTime + 0.05;
      bgmTimer = window.setInterval(scheduleBgm, BGM_LOOKAHEAD_MS);
    },
    /** AUD-03: retempos the loop for a new zone; the melody/bar position keeps playing through. */
    setBgmZone(zoneId: string) {
      bgmBpm = BGM_TEMPO[zoneId] ?? bgmBpm;
    },
    /** AUD-03: ducks the BGM master gain 50% while a zone banner is showing. */
    setBgmDucked(ducked: boolean) {
      if (!audio || !bgmMasterGain) {
        return;
      }
      const target = ducked ? BGM_MASTER_GAIN * 0.5 : BGM_MASTER_GAIN;
      bgmMasterGain.gain.linearRampToValueAtTime(
        target,
        audio.currentTime + 0.1,
      );
    },
    /** AUD-03: stops the loop with a short release (not a hard cut) on cleared/gameover. */
    stopBgm() {
      if (bgmTimer !== null) {
        window.clearInterval(bgmTimer);
        bgmTimer = null;
      }
      if (audio && bgmMasterGain) {
        const gain = bgmMasterGain;
        gain.gain.linearRampToValueAtTime(0.0001, audio.currentTime + 0.4);
        setTimeout(() => gain.disconnect(), 500);
      }
      bgmMasterGain = null;
    },
    /** AUD-04: starts `zoneId`'s ambient layer; a no-op for a zone id with none defined. */
    startAmbient(zoneId: string) {
      if (!audio) {
        return;
      }
      ambientZone = zoneId;
      beginZoneAmbient(zoneId);
    },
    /** AUD-04: swaps the ambient layer for a new zone; a no-op if the zone is unchanged. */
    setAmbientZone(zoneId: string) {
      if (!audio || ambientZone === zoneId) {
        return;
      }
      ambientZone = zoneId;
      stopAmbientLoop();
      clearAmbientTimer();
      beginZoneAmbient(zoneId);
    },
    /** AUD-04: fades out and tears down the current ambient layer. */
    stopAmbient() {
      ambientZone = null;
      stopAmbientLoop();
      clearAmbientTimer();
    },
    dispose() {
      if (bgmTimer !== null) {
        window.clearInterval(bgmTimer);
        bgmTimer = null;
      }
      clearAmbientTimer();
      stopAmbientLoop();
      if (audio && audio.state !== "closed") {
        void audio.close();
      }
      audio = null;
    },
  };
}
