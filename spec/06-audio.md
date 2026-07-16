---
id: SPEC-AUDIO
title: Audio (SFX Catalog & Music Direction)
status: implemented
code: [src/audio.ts, src/gameController.ts, src/App.tsx]
---

# Audio

Direction: **100% procedural Web Audio** — zero asset bytes, no decode
latency, no file-format quirks. The existing synth voices are restructured
into a chiptune flavor that fits the fantasy-town world.

Authored audio files (≤150 KB total, OGG+M4A) were the P12 escape hatch,
evaluated after `AUD-04` landed. **Closed as skipped**: with `AUD-04`'s three
zone ambient layers stacked under the existing BGM and 7-voice SFX catalog,
the mix already has enough variety that the procedural BGM's "flatness"
premise for reaching for authored audio doesn't hold; adding binary audio
assets would also break the zero-asset-bytes property this direction was
chosen for (`RND-INV-1`'s zero-PNG-playability spirit, applied to audio). No
OGG/M4A files were added.

## AUD-01 — Unlock rule

Status: implemented (src/audio.ts createSfx)

The `AudioContext` is created/resumed only from a user gesture (`sfx.unlock()`
on pointer-down, key-down, and the start button). Every new audio feature must
route through the same unlock; nothing may autoplay. The context is closed on
component cleanup (`dispose`).

## AUD-02 — SFX catalog

Status: implemented — 7 voices (src/audio.ts createSfx), including P5's clear
bell and gameOver noise burst, and P11's shieldGet/shieldBreak

The catalog is keyed by `SfxId`. Canonical (src/audio.ts):

```ts
export type SfxId =
  | "dash"
  | "levelUp"
  | "clear"
  | "gameOver"
  | "coin"
  | "shieldGet"
  | "shieldBreak";
```

| SfxId | game event | recipe | status |
|---|---|---|---|
| `dash` | lane switch | current downward sweep (square, 240→90 Hz), volume lowered to ~0.04 (it fires constantly) | implemented (tweak planned, P2) |
| `levelUp` | zone change banner | current fanfare C5–E5–G5 square | implemented |
| `clear` | reaching the castle gate | current arpeggio + a low bell (sine 523 Hz, ~1.2 s decay) | implemented (P5) |
| `gameOver` | crash | current sawtooth down-sweep + a white-noise burst (~0.2 s buffer noise, exponential decay) for the pratfall | implemented (P5) |
| `coin` | item collect | two-note ping E6→B6, square wave, ~0.09 s | implemented (P4) |
| `shieldGet` | shield pickup (sweet-roll) | warm major chord (C5-E5-G5 triangle) | implemented (P11) |
| `shieldBreak` | shield absorbs a hit | glass-pop (sine 900→300 Hz + a short noise tick) | implemented (P11) |

`SPEC-ENTITIES` `CollisionEffect.collect.sfx` references these ids — adding an
item with a new sound means adding a voice here first.

## AUD-03 — BGM

Status: implemented (P5: src/audio.ts createSfx's startBgm/setBgmZone/
setBgmDucked/stopBgm; src/gameController.ts/src/App.tsx wiring)

Procedural chip loop scheduled with `AudioContext` look-ahead (the standard
two-timer pattern: a `setInterval` scheduler tops up a `bgmNextStepTime`
cursor, scheduling exact-time notes `BGM_SCHEDULE_AHEAD_SEC` (0.1 s) ahead of
`currentTime`): an 8-bar square-wave lead (`BGM_LEAD`) over a triangle bass
(`BGM_BASS`, one sustained root per bar, an octave down). Zone character
comes from tempo, key stays fixed:

| zone | tempo |
|---|---|
| `old-town` | 112 BPM |
| `market-street` | 126 BPM |
| `castle-road` | 140 BPM |

- Key stays **C major** so the `levelUp` fanfare (C5–E5–G5) always lands
  consonant over the loop.
- Master BGM gain ~0.04 (`BGM_MASTER_GAIN`); ducks 50% while a zone banner is
  showing (`src/gameController.ts` toggles `sfx.setBgmDucked` on
  `sim.bannerTime`'s edge, not every frame, to avoid redundant gain ramps).
- BGM starts with `running` (`start()` calls `sfx.startBgm`) and stops
  (0.4 s linear release, not a hard cut) on `cleared`/`gameover`
  (`sfx.stopBgm()`, alongside `sfx.clear()`/`sfx.gameOver()`).
- A zone change re-tempos the loop in place via `setBgmZone` — the melody/bar
  position keeps playing through, it doesn't restart.

## AUD-04 — Ambient flavor

Status: implemented (P12: src/audio.ts createSfx's startAmbient/
setAmbientZone/stopAmbient)

All procedural, layered under the BGM at low gain. Zone-keyed like `AUD-03`'s
tempo table, dispatched by `beginZoneAmbient`:

| zone | layer | recipe |
|---|---|---|
| `old-town` | bird blips | two-note sine chirp (1800→2400 Hz), rescheduled every 4–9 s (`scheduleBirdBlip`) |
| `market-street` | crowd murmur | a looping 2 s noise buffer through a bandpass filter (~1000 Hz, Q 1.2), gain ~0.018 (`startAmbientLoop`) |
| `castle-road` | wind + banner-flap | a looping lowpass-filtered noise bed (~500 Hz), gain ~0.02, plus a bandpass noise transient (~700 Hz) rescheduled every 3–6 s (`scheduleBannerFlap`) |

Continuous loops fade in/out over `AMBIENT_FADE_SEC` (0.5 s) on zone switch or
`stopAmbient()` rather than cutting hard. Wiring mirrors `AUD-03`:
`sfx.startAmbient(zoneId)` on `start()` (`src/App.tsx`), `sfx.setAmbientZone`
on the same zone-change edge that calls `setBgmZone` (`src/gameController.ts`
`updateGame`), `sfx.stopAmbient()` alongside `stopBgm()` on crash/clear.
