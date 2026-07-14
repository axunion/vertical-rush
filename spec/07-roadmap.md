---
id: SPEC-ROADMAP
title: Implementation Roadmap
status: partial
code: []
---

# Implementation Roadmap

Ordered phases. **P0–P8 are complete** — one-line summaries below; their full
scope, completion criteria, and verification text lives in git history.
Scheduled work is **P9–P12**; remaining ideas live in the unscheduled backlog
at the bottom. Each phase is **independently shippable**: the game is
complete-feeling at every phase boundary. Do not start backlog scope without
first scheduling it into a phase.

Every phase ends with the same verification triplet:

1. `pnpm test` — all unit tests green.
2. `pnpm check` — Biome + `tsc -b` green.
3. The `verify` skill (`.claude/skills/verify/SKILL.md`) — both deterministic
   scenarios: `Math.random = () => 0.4` (idle player clears at the goal,
   240 m) and `Math.random = () => 0.9` (crash within ~5 s).

Completion additionally requires flipping the relevant `Status:` lines in
these specs from `planned (Pn)` to `implemented (module symbol)` in the same
commit — that is what keeps spec/code drift structurally bounded.

## Completed phases (P0–P8)

Status: implemented

One line per phase; details are in git history.

- **P0 — Specification suite.** This spec set plus the `CLAUDE.md`
  spec-sync/tunables-ownership rules and the README pointer.
- **P1 — Extraction (zero behavior change).** Split the 879-line `App.tsx`
  into `audio.ts`/`render.ts`/`entities.ts` + `SPAWN_GAP`; verify skill
  passed unedited.
- **P2 — Pixel pipeline + Karamell re-theme.** 180×320 offscreen canvas
  (`RND-01/02/03`), palette (`WLD-02`), fallback drawers (`RND-07`), player
  key color `#D95763` (`RND-05`).
- **P3 — Sprite-sheet pipeline.** `src/sprites.ts` manifest + `frameAt`,
  per-sheet loader with silent fallback (`RND-INV-1`), authored `poco.png`.
- **P4 — Items & collection.** `coin`, trail rule (`ENT-03`), pickup margin
  (`CORE-02`), pure score helper (`CORE-04`), coin SFX and HUD counter.
- **P5 — Content & difficulty pass.** `ZONE_TABLE` (`CORE-03`), zone-keyed
  `SPAWN_TABLE`, `gem`, three movers (`ENT-INV-2`), zone-transition
  presentation, BGM + clear/crash SFX. Landed via `ENT-05`'s behavior-kind
  carve-out; the data-only extensibility claim is scheduled to be proven
  in P10.
- **P6 — Short-run retune (instant loop).** 240 m / ~24 s runs (`CORE-03`
  retable), instant tap-to-retry (`CORE-05`), persisted best score
  (`CORE-06`).
- **P7 — Entity sheet contract.** `entities` sheet manifest (`RND-08`), all
  7 `ENTITY_DEFS` rows sprite-bound (`ENT-06`), authored `entities.png`.
- **P8 — Background tile pipeline.** `town` tile manifest (`TILE_SHEETS`,
  `RND-09`), image branches in the background painters with the procedural
  fallback intact (`RND-INV-1`), authored `town.png`.

## P9 — Codebase restructure (zero behavior change)

Status: planned (P9)

A second extraction pass with P1's discipline: `src/render.ts` (~1300 lines)
and `src/App.tsx` (~780 lines) have grown far past the one-concern-per-file
rule; split them before any new content lands on top.

**Scope:**

- Split `src/render.ts` into a `src/render/` directory. Planned map (exact
  boundaries may shift during the phase; the gate below may not):
  `types.ts`, `helpers.ts` (color/cache/stroke utilities), `display.ts`
  (display-fit pipeline), `sheets.ts` (image loading), `particles.ts`
  (particle/speed-line sim + draw), `road.ts` (road/curb/lane painters +
  tile-pattern caches), `landmarks.ts` (castle gate + zone landmarks),
  `shapes.ts` (fallback shape painters), `entities-draw.ts`
  (sprite/entity/player dispatch), `frame.ts` (`renderFrame` orchestrator +
  banner), and an `index.ts` barrel re-exporting the current public surface
  so `import ... from "./render"` call sites stay valid.
- Extract from `src/App.tsx`: `src/config.ts` (`GAME_CONFIG`,
  `ZONE_PALETTES`, and the derived zone constants), `src/zoneVisuals.ts`
  (pure zone crossfade/color functions), and `src/gameController.ts` (the
  `sim` blob, spawn/collision/update functions, and the per-frame step —
  Solid-free, with the signal accessors injected). `App.tsx` keeps signals,
  input/DOM wiring, and JSX.
- Add unit tests (node environment) for the newly isolated pure functions:
  the color/cache helpers, `computeDisplayFit`, the particle/speed-line sim
  helpers, and the zone-visual functions.
- **No new dependencies.** Evaluated and rejected for now: game/rendering
  frameworks (they would replace the speced `RND-01/02/03` pipeline and
  break the verify skill's pixel scan), state libraries (the signal-vs-`sim`
  split is deliberate — `SPEC-OVERVIEW › Glossary`), audio libraries (the
  P12 authored-audio option fits the existing Web Audio gain graph via
  `decodeAudioData`), and test-environment additions such as jsdom (the
  browser verify skill covers the DOM/canvas surface; revisit only if the
  Solid-free game controller needs node tests that prove impossible
  without one).

**Completion criteria:**

- Zero behavior change: no gameplay, difficulty, palette, or timing value
  changes; the verify skill passes **unedited** (the P1 precedent).
- Every spec `Status:` line whose module/symbol reference moves is repointed
  in the same commit (notably `RND-05`/`WLD-02`: `src/App.tsx
  GAME_CONFIG.colors` → its new home), and `SPEC-ENTITIES › Target module
  layout` plus the `CLAUDE.md` Architecture section describe the new layout.
- New unit tests exist for the newly-pure extracted functions; existing
  tests stay green with at most import-path edits.

**Verification:** the standard triplet, plus a diff review confirming the
change is move-only (no logic edits beyond import paths and the
controller's explicit-parameter seams).

## P10 — Remaining obstacle cast (proves ENT-05)

Status: planned (P10)

The three obstacles designed in `SPEC-WORLD › Obstacle cast` land, and
`town-guard` is the long-deferred proof of the `ENT-05` data-only
extensibility claim.

**Scope:**

- `town-guard` (16×24): reuses the existing `roller` behavior at 0.6× world
  speed, so it must land via `ENT-05` steps 1–3 alone — no edits to
  `App.tsx`, the render dispatch, or `gameLogic.ts`.
- `fountain` (40×40, static): eligible in the weighted pick only when the
  row's blocked lane is the center lane (`ENT-02`).
- `banner-arch` (visual 156×24, hitbox 38×24 per blocked lane): a scripted
  castle-road full-row variant skinning the safe-lane row — not a weighted
  pick; trigger frequency tuned during the phase.
- `SPAWN_TABLE` refs per the `ENT-02` weights (`town-guard` 8, `fountain` 5,
  `banner-arch` scripted).
- Widen `entities.png` beyond 80 px and append three bands below `y = 144`
  (`RND-08`); fallback shapes per `RND-07` (new members or reuse, decided
  in-phase).

**Completion criteria:**

- `WLD-01` pairing intact; `ENT-06` binding tests cover the new bands.
- `town-guard` lands data-only (a new fallback drawer is the
  `RND-07`-sanctioned rare exception and does not void the claim), flipping
  `ENT-05` to implemented.
- `fountain` never blocks a non-center lane; `banner-arch` rows keep
  `ENT-INV-1` by construction.
- All values tuned during the phase are written back into `ENT-02`.

**Verification:** the triplet, run twice — with sheets present and with
`public/assets/` temporarily renamed away (both render paths for the new
entities).

**Status flips:** `SPEC-WORLD › Obstacle cast`; the `ENT-02` registry Status
line and its three obstacle rows; `SPEC-ENTITIES › Extensibility contract`
(`ENT-05`) → implemented; the `RND-07` member list and the `RND-08`
`entities.png` band table gain their rows in the same commit.

## P11 — Effect items

Status: planned (P11)

**Scope:**

- `sweet-roll` (shield: absorbs exactly one hit — `shieldBreak` sfx and the
  run continues), `hourglass` (slow: world speed ×0.6 for 3 s), `magnet`
  (nearby coins fly to Poco for 5 s; pull radius tuned during the phase) —
  values per `SPEC-WORLD › Item cast`.
- `CollisionEffect` gains the `shield`/`slow`/`magnet` members drafted in
  `ENT-01`; a single `activeEffects` structure on the sim — effects never
  stack, re-collect refreshes duration (`SPEC-ENTITIES › Collection
  mechanics`).
- `shieldGet`/`shieldBreak` voices (`AUD-02`); `hourglass`/`magnet` pickups
  reuse the `coin` sfx unless a distinct voice proves necessary in-phase.
- An HUD effect indicator (designed in-phase); `entities.png` bands and
  fallback shapes for the three items.

**Completion criteria:**

- `ENT-INV-3` holds: the items spawn in the safe lane and skipping one is
  never punished; effects never gate the clear condition (`CORE-INV-3` —
  slow scales scroll speed, never `TARGET_DISTANCE`).
- Shield converts exactly one crash into `shieldBreak` + continue; the
  second hit ends the run.
- Unit tests cover effect timing, the no-stack rule, and
  refresh-on-recollect.
- All values tuned during the phase are written back into `ENT-02` and
  Collection mechanics.

**Verification:** the triplet, plus a manual check: collect a shield, crash
once (run continues), crash again (run ends).

**Status flips:** `SPEC-WORLD › Item cast`; `ENT-01` (the planned comment
members become real union members); the `ENT-02` item rows;
`SPEC-ENTITIES › Collection mechanics`; the `AUD-02` `shieldGet`/
`shieldBreak` rows.

## P12 — Polish (pixel font, ambient audio, authored audio)

Status: planned (P12)

**Scope:**

- An embedded pixel font for HUD/overlay text. UI display text is Japanese,
  so glyph coverage (kana/kanji vs digits/Latin only) is decided in-phase;
  whatever the font does not cover keeps the current sans-serif stack
  (`SPEC-WORLD › Art style rules`).
- `AUD-04` ambient layers — keeps its own escape clause: skip (and close the
  item with a recorded rationale) if it muddies phone speakers.
- Authored audio files: evaluated after `AUD-04`; adopt ≤150 KB OGG+M4A only
  if the procedural BGM still reads flat, otherwise record the decision in
  `SPEC-AUDIO` and close the item.

**Completion criteria:**

- The chosen font renders all HUD/overlay strings legibly at display scale,
  and the change leaves the `RND-05` verify scan row undisturbed.
- `AUD-04` and the authored-audio question are each either implemented or
  explicitly closed with a rationale in `SPEC-AUDIO`.

**Verification:** the triplet, plus a manual audio review on a phone
speaker.

**Status flips:** `AUD-04`; the `SPEC-AUDIO` intro's authored-audio note;
the `SPEC-WORLD › Art style rules` typography bullet.

## Backlog (unscheduled)

Status: planned (unscheduled)

Endless mode after clear, and tightening the fallback palette's `terracotta`
out of the `RND-05` tolerance box (the known-ambiguity note there).
Everything else previously listed here is scheduled into P10–P12. None of
these may be implemented ahead of being scheduled into a phase.
