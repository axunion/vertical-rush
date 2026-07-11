---
id: SPEC-AUDIO
title: Audio (SFX Catalog & Music Direction)
status: partial
code: [src/audio.ts, src/App.tsx]
---

# Audio

Direction: **100% procedural Web Audio** — zero asset bytes, no decode
latency, no file-format quirks. The existing synth voices are restructured
into a chiptune flavor that fits the fantasy-town world. Authored audio files
(≤150 KB total, OGG+M4A) are a post-P5 escape hatch only if the procedural
BGM proves flat.

## AUD-01 — Unlock rule

Status: implemented (src/audio.ts createSfx)

The `AudioContext` is created/resumed only from a user gesture (`sfx.unlock()`
on pointer-down, key-down, and the start button). Every new audio feature must
route through the same unlock; nothing may autoplay. The context is closed on
component cleanup (`dispose`).

## AUD-02 — SFX catalog

Status: partial — 5 voices implemented (src/audio.ts createSfx); rows marked planned extend the catalog

The catalog is keyed by `SfxId`. Canonical (src/audio.ts):

```ts
export type SfxId = "dash" | "levelUp" | "clear" | "gameOver" | "coin";
// Planned additive members (post-P5): "shieldGet" | "shieldBreak"
```

| SfxId | game event | recipe | status |
|---|---|---|---|
| `dash` | lane switch | current downward sweep (square, 240→90 Hz), volume lowered to ~0.04 (it fires constantly) | implemented (tweak planned, P2) |
| `levelUp` | zone change banner | current fanfare C5–E5–G5 square | implemented |
| `clear` | reaching the castle gate | current arpeggio + added low bell (sine 523 Hz, ~1.2 s decay) | implemented (bell planned, P5) |
| `gameOver` | crash | current sawtooth down-sweep + added white-noise burst (~0.2 s buffer noise) for the pratfall | implemented (noise planned, P5) |
| `coin` | item collect | two-note ping E6→B6, square wave, ~0.09 s | implemented (P4) |
| `shieldGet` / `shieldBreak` | effect items | warm major chord / glass pop | planned (post-P5) |

`SPEC-ENTITIES` `CollisionEffect.collect.sfx` references these ids — adding an
item with a new sound means adding a voice here first.

## AUD-03 — BGM

Status: planned (P5)

Procedural chip loop scheduled with `AudioContext` look-ahead (the standard
two-timer pattern): an 8-bar square-wave lead over a triangle bass. Zone
character comes from tempo, key stays fixed:

| zone | tempo |
|---|---|
| `old-town` | 112 BPM |
| `market-street` | 126 BPM |
| `castle-road` | 140 BPM |

- Key stays **C major** so the `levelUp` fanfare (C5–E5–G5) always lands
  consonant over the loop.
- Master BGM gain ~0.04; duck 50% while a zone banner is showing.
- BGM starts with `running` and stops (release, not hard cut) on
  `cleared`/`gameover`.

## AUD-04 — Ambient flavor

Status: planned (post-P5, optional)

Clearly optional polish, all procedural: sparse two-note sine bird blips every
4–9 s in `old-town`; low band-passed noise "crowd murmur" in `market-street`;
wind + banner-flap in `castle-road`. Skip entirely if it muddies the mix on
phone speakers.
