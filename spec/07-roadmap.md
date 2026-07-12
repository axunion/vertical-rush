---
id: SPEC-ROADMAP
title: Implementation Roadmap
status: partial
code: []
---

# Implementation Roadmap

Ordered phases. **P0–P7 (the pixel-art fantasy town redesign, the short-run
casual retune, and the entity sheet contract) are complete** and kept below as
summaries only — their full scope text lives in git history. Current work is
**P8**: the background tile pipeline (`town.png`), the second half of the
drop-in image theming contract. Each phase is **independently shippable**:
the game is complete-feeling at every phase boundary. Do not start a phase's
scope early; specs mark deferred work as `planned (Pn)` for a reason.

Every phase ends with the same verification triplet:

1. `pnpm test` — all unit tests green.
2. `pnpm check` — Biome + `tsc -b` green.
3. The `verify` skill (`.claude/skills/verify/SKILL.md`) — both deterministic
   scenarios: `Math.random = () => 0.4` (idle player clears at the goal,
   240 m) and `Math.random = () => 0.9` (crash within ~5 s).

Completion additionally requires flipping the relevant `Status:` lines in
these specs from `planned (Pn)` to `implemented (module symbol)` in the same
commit — that is what keeps spec/code drift structurally bounded.

## Completed phases (P0–P7)

Status: implemented

Summaries only; full scope, completion criteria, and verification text is in
git history (this file, before the P6/P7 rewrites, and before the P7 summary
fold-in).

- **P0 — Specification suite.** This document set, the `CLAUDE.md`
  spec-sync/tunables-ownership rules, and the README pointer.
- **P1 — Extraction (zero behavior change).** Split the 879-line `App.tsx`
  into `audio.ts`/`render.ts`/`entities.ts` plus `SPAWN_GAP` in
  `gameLogic.ts`; behavior pixel-identical, verify skill passed unedited.
- **P2 — Pixel pipeline + fantasy re-theme.** 180×320 offscreen canvas,
  integer scaling and letterboxing (`RND-01/02/03`), Karamell palette
  (`WLD-02`), chunky fallback drawers (`RND-07`), player key color contract
  (`RND-05`, verify color constant updated to `#D95763`).
- **P3 — Sprite-sheet pipeline.** `src/sprites.ts` manifest + `frameAt`,
  per-sheet loader with silent fallback (`RND-INV-1`), authored
  `public/assets/sheets/poco.png`.
- **P4 — Items & collection.** `coin` entity, coin-trail rule (`ENT-03`),
  pickup margin (`CORE-02`), pure score helper (`CORE-04`), coin SFX and HUD
  counter.
- **P5 — Content & difficulty pass.** Table-driven zones (`CORE-03`
  `ZONE_TABLE`), zone-keyed `SPAWN_TABLE`, `gem`, three movers
  (dart/walker/roller, `ENT-INV-2`), zone transition presentation (palette
  crossfade, landmarks, castle gate), BGM + clear/crash SFX. Note: movers and
  `gem` landed via `ENT-05`'s behavior-kind carve-out plus new fallback
  shapes, so the literal data-only extensibility claim remains unproven and
  `SPEC-ENTITIES › Extensibility contract` stays `planned` — deferred, not a
  P5 blocker.
- **P6 — Short-run redesign (instant loop).** Compressed a run from 500 m /
  ~62 s to **240 m / ~24 s** via a `ZONE_TABLE` retable (`CORE-03`: bounds
  50/150, speeds 7/10/13, tighter spawn-gap ramps) and shorter zone-transition
  presentation (`bannerDuration` 0.8 s, `zoneCrossfadeDuration` 1.2 s); added
  instant tap-to-retry (`CORE-05`: `GAME_CONFIG.retryLockout` 0.4 s input lock
  on entering a terminal phase, then any tap/keypress restarts straight into
  `running`, never back through `ready`) and a persisted best score
  (`CORE-06`: `localStorage` `vertical-rush.best`, shown on both result
  overlays). Structure (3 zones, clear-at-the-gate, one-hit runs) was
  unchanged; only pacing and the retry loop changed.
- **P7 — Entity sheet contract (`entities.png`).** Added the `entities`
  `SpriteSheetDef` (`src/sprites.ts`, `SPEC-RENDER › RND-08` layout: 80×144,
  one band per entity) and flipped all 7 `ENTITY_DEFS` rows from
  `sprite: null` to `sprite: { sheet: "entities", animation: <id> }`
  (`SPEC-ENTITIES › ENT-06`) — `drawEntity`'s sprite-or-fallback dispatch
  needed no changes. Authored `public/assets/sheets/entities.png` (Karamell
  palette, 1px ink outlines, 1-bit alpha; substitutes a safe rust-brown for
  the palette's `terracotta` on the cat/chicken bands since `terracotta`
  sits inside the `RND-05` rust-red tolerance box — the theming addendum
  requires authored art to avoid it, unlike the grandfathered procedural
  fallback). Verify skill triplet passed twice, with `entities.png` present
  and with `public/assets/` temporarily renamed away.

## P8 — Background tile pipeline (`town.png`)

Status: planned (P8)

**Goal:** road, curbs, the castle gate, and zone landmarks render from the
drop-in `town.png` when it exists (`SPEC-RENDER › RND-08` regions), falling
back to the current procedural painters when it doesn't. With P7, replacing
the three PNGs re-themes the whole game (`SPEC-WORLD › WLD-06`).

**Scope:**

- `src/sprites.ts`: `TileSheetDef` + `TILE_SHEETS` per `SPEC-RENDER ›
  RND-09` (regions reuse `FrameRect`; no animation semantics). Bounds/overlap
  unit tests.
- `src/render.ts`: loosen `loadSpriteSheets` input to `{ src: string }`;
  region → `CanvasPattern` cache; image branches in
  `drawRoad`/`drawCurbs` (per-zone pattern fill, zone crossfade as a two-pass
  `globalAlpha` blend of the from/to zone patterns during the existing fade
  window) and `drawCastleGate`/`drawZoneLandmark` (single `drawImage` each).
  Missing image → the current procedural path, untouched. Lane lines, speed
  lines, and particles stay procedural.
- `src/App.tsx`: load `{ ...SPRITE_SHEETS, ...TILE_SHEETS }` into the
  existing sheet map; pass the zone-blend state (already tracked for
  `frameColors`) into the painters.

**Completion criteria:**

- With `town.png` present, road/curbs/gate/landmarks draw from the sheet and
  the zone transition crossfades between zone tile variants; absent, the
  procedural painters render identically to today.
- The RND-05 scan row stays unambiguous with tiles present (the `RND-08`
  key-color exclusion rule).
- `RND-08` (town part), `RND-09`, and `WLD-06` flipped to `implemented`.

**Verification:** the triplet, run **twice** — with and without
`public/assets/` — plus a manual zone-transition screenshot review.

## Backlog (unscheduled)

Status: planned (unscheduled)

Effect items (`sweet-roll`, `hourglass`, `magnet` — `SPEC-ENTITIES ›
collection mechanics`), `town-guard`/`fountain`/`banner-arch`, ambient audio
(`AUD-04`), authored audio files, pixel font, endless mode after clear.
Best-score persistence moved into P6. None of these may be implemented ahead
of being scheduled into a phase.
