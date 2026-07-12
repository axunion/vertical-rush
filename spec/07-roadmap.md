---
id: SPEC-ROADMAP
title: Implementation Roadmap
status: partial
code: []
---

# Implementation Roadmap

Ordered phases. **P0–P5 (the pixel-art fantasy town redesign) are complete**
and kept below as summaries only — their full scope text lives in git history.
Current work is **P6–P8**: the short-run casual retune and the drop-in image
theming contract. Each phase is **independently shippable**: the game is
complete-feeling at every phase boundary. Do not start a phase's scope early;
specs mark deferred work as `planned (Pn)` for a reason.

Every phase ends with the same verification triplet:

1. `pnpm test` — all unit tests green.
2. `pnpm check` — Biome + `tsc -b` green.
3. The `verify` skill (`.claude/skills/verify/SKILL.md`) — both deterministic
   scenarios: `Math.random = () => 0.4` (idle player clears at the goal —
   500 m today; **240 m once P6 lands**, which updates the skill's distances
   first) and `Math.random = () => 0.9` (crash within ~5 s).

Completion additionally requires flipping the relevant `Status:` lines in
these specs from `planned (Pn)` to `implemented (module symbol)` in the same
commit — that is what keeps spec/code drift structurally bounded.

## Completed phases (P0–P5)

Status: implemented

Summaries only; full scope, completion criteria, and verification text is in
git history (this file, before the P6 rewrite).

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

## P6 — Short-run redesign (instant loop)

Status: planned (P6)

**Goal:** the game becomes a rapid loop of short bursts — one run compresses
from 500 m / ~62 s to **240 m / ~24 s**, and a finished run restarts with a
single tap in under a second. Structure (3 zones, clear-at-the-gate, one-hit
runs) is unchanged; only pacing and the retry loop change.

**Scope:**

- **Difficulty retable** (`src/gameLogic.ts`, test-first).
  `TARGET_DISTANCE` 500 → **240**. New `ZONE_TABLE` values — on completion
  this table replaces the `SPEC-CORE › CORE-03` source-of-truth table (which
  keeps the implemented 500 m values until then):

  | zone id | level | range (m) | speed (m/s) | spawn gap (m, ramp) | zone time |
  |---|---|---|---|---|---|
  | `old-town` | 1 | 0 ≤ d ≤ 50 | 7 | 7 → 6 | 7.1 s |
  | `market-street` | 2 | 50 < d ≤ 150 | 10 | 6.5 → 5.5 | 10.0 s |
  | `castle-road` | 3 | 150 < d (`upTo: Infinity`, ramp capped at 240) | 13 | 6 → 5.5 | 6.9 s |

  Perfect run: 50/7 + 100/10 + 90/13 ≈ **24.1 s**. The opening speeds up
  (5 → 7 m/s) so the first zone is not a third of the run spent warming up;
  reaction windows stay casual (old-town gap/speed ≈ 0.86 s at worst).
  `SPAWN_GAP.initialDelay` stays 6 m — the speed bump alone compresses
  time-to-first-row to ~0.86 s. Landmark positions, gem midpoints, and the
  HUD progress bar all derive from `ZONE_TABLE`/`TARGET_DISTANCE` and follow
  automatically.
- **Compressed presentation** (`src/App.tsx` `GAME_CONFIG`):
  `bannerDuration` 1.2 → **0.8 s**, `zoneCrossfadeDuration` 2 → **1.2 s** (a
  2 s fade would occupy a third of the new 6.9 s final zone).
- **Instant retry** (`SPEC-CORE › CORE-05`, new): on entering
  `cleared`/`gameover`, input locks for `GAME_CONFIG.retryLockout`
  (**0.4 s**) — absorbing trailing panic taps from the crash and matching the
  0.45 s shake settling — then any pointer tap on the play area or any
  keypress calls the existing `start()` straight into `running`. Retry never
  re-enters `ready`. The first-launch `ready` screen stays (controls text +
  audio-unlock gesture) and additionally accepts tap-anywhere. The overlay
  start/retry `<button>` stays (accessibility + the verify skill drives it);
  result captions state the tap affordance.
- **Best score** (`SPEC-CORE › CORE-06`, new; pulled forward from the
  backlog): `localStorage` key `vertical-rush.best`, read once on mount and
  written on run end inside try/catch (private-mode safe), shown on both
  result overlays. Lives entirely in `src/App.tsx` (`CORE-INV-2`).

**Completion criteria:**

- Perfect-run time ≈ 24 s; `ZONE_TABLE`/`TARGET_DISTANCE` match the CORE-03
  table exactly (boundary tests updated test-first).
- Terminal-phase tap during the 0.4 s lockout does **not** restart; after it,
  a tap restarts into `running` within one frame.
- Best score persists across a reload and only ever increases.
- `SPEC-CORE` CORE-03/CORE-05/CORE-06 and the `SPEC-OVERVIEW` pitch flipped
  to the new values/`implemented` in the same commit.

**Verification:** update the hardcoded distances in
`.claude/skills/verify/SKILL.md` (clear at 240 m ≈ 24 s; LV.2 past 50 m ≈ 7 s,
LV.3 past 150 m ≈ 17 s) and `.claude/skills/phase-gate/SKILL.md` (500 m
mention) **first**, add the lockout check to the verify scenarios, then run
the triplet.

## P7 — Entity sheet contract (`entities.png`)

Status: planned (P7)

**Goal:** all obstacles and items render from one drop-in sprite sheet when
it exists. The sheet layout is fixed by `SPEC-RENDER › RND-08`; the game
stays fully playable without the PNG (`RND-INV-1`).

**Scope:**

- `src/sprites.ts`: add the `entities` `SpriteSheetDef`
  (src `/assets/sheets/entities.png`), one looping animation per entity named
  by its entity id, frames per the `RND-08` table, driven by the existing
  global animation clock `drawEntity` already receives. No per-instance
  state animations (the cat's twitch loop doubles as its telegraph).
- `src/entities.ts`: flip all 7 `ENTITY_DEFS` rows from `sprite: null` to
  `sprite: { sheet: "entities", animation: <id> }` (`SPEC-ENTITIES ›
  ENT-06`). `drawEntity`'s sprite-or-fallback branch is already implemented —
  no `render.ts`/`App.tsx` changes.
- Tests: every `def.sprite` resolves to an existing sheet + animation; every
  referenced frame's `w`/`h` equals `def.size`; frames stay inside the sheet
  bounds and bands don't overlap.

**Completion criteria:**

- With `entities.png` present, all obstacles/items animate from the sheet;
  with it absent, fallback shapes render identically to today.
- `RND-08` (entities part), `RND-04` note, and `ENT-06` flipped to
  `implemented`.

**Verification:** the triplet, run **twice** — with assets present and with
`public/assets/` temporarily moved away (the P3 pattern).

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
