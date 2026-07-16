---
id: SPEC-ROADMAP
title: Implementation Roadmap
status: partial
code: []
---

# Implementation Roadmap

Ordered phases. **P0–P11 are complete** — one-line summaries below; their full
scope, completion criteria, and verification text lives in git history.
Scheduled work is **P12**; remaining ideas live in the unscheduled backlog
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

## Completed phases (P0–P11)

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
  carve-out; the data-only extensibility claim was proven in P10.
- **P6 — Short-run retune (instant loop).** 240 m / ~24 s runs (`CORE-03`
  retable), instant tap-to-retry (`CORE-05`), persisted best score
  (`CORE-06`).
- **P7 — Entity sheet contract.** `entities` sheet manifest (`RND-08`), all
  7 `ENTITY_DEFS` rows sprite-bound (`ENT-06`), authored `entities.png`.
- **P8 — Background tile pipeline.** `town` tile manifest (`TILE_SHEETS`,
  `RND-09`), image branches in the background painters with the procedural
  fallback intact (`RND-INV-1`), authored `town.png`.
- **P9 — Codebase restructure (zero behavior change).** A second P1-style
  extraction pass, move-only: `src/render.ts` split into `src/render/`
  (`types.ts`/`helpers.ts`/`display.ts`/`sheets.ts`/`particles.ts`,
  node-importable, plus DOM-only `road.ts`/`landmarks.ts`/`shapes.ts`/
  `entities-draw.ts`/`frame.ts`, with an `index.ts` barrel keeping the
  public surface stable); `src/App.tsx` split into `src/config.ts`
  (`GAME_CONFIG`/zone palettes/`GamePhase`), `src/zoneVisuals.ts` (pure
  crossfade helpers), and `src/gameController.ts` (the `sim` blob and
  update/spawn/collision steps, Solid-free via injected hooks). New unit
  tests cover the newly node-importable pure functions
  (`src/render/helpers.test.ts`, `display.test.ts`, `particles.test.ts`,
  `src/zoneVisuals.test.ts`); the verify skill passed unedited.
- **P10 — Remaining obstacle cast (proves ENT-05).** `town-guard`
  (`src/entities.ts` `ENTITY_DEFS`, a `roller` `speedFactor: 0.6`
  `WeightedRef` added to `market-street`/`castle-road`'s obstacle pools —
  the `ENT-05` data-only proof, zero edits to `gameController.ts`/
  `entities-draw.ts`/`gameLogic.ts`); `fountain` (`market-street`,
  center-lane-only via the new `EntityDef.laneRestriction` field feeding a
  per-lane filter in `positionObstacleRow`); `banner-arch` (`castle-road`,
  scripted via `shouldSpawnBannerArch`/`positionBannerArchRow` in
  `src/gameController.ts` `spawnObstacleRow` — always blocks every non-safe
  lane, bypassing the weighted pick entirely, so `ENT-INV-1` holds by
  construction). Three new `FallbackShape` members (`guard`/`fountain`/
  `banner`, `src/render/shapes.ts`); `entities.png` grew 80×144 → 80×232 to
  append the three bands (`banner-arch` authored per-lane at 38×24 rather
  than one continuous 156-wide visual — reuses the existing per-instance
  sprite dispatch with no new rendering machinery). Verified with sheets
  present and with `public/assets/` renamed away.
- **P11 — Effect items.** `sweet-roll` (shield: `advanceObstacles` takes a
  `hasShield` flag and, on a collision while it's true, removes the obstacle
  but still reports the same boolean hit; `updateGame` already holds
  `sim.effects.shield` and decides shieldBreak (sfx, run continues) vs a real
  crash from that one boolean — a second hit crashes normally), `hourglass` (slow:
  world speed ×0.6 for 3 s, scaling `updateGame`'s distance/scroll/anim
  speed — `CORE-INV-3` holds, `TARGET_DISTANCE` itself never changes),
  `magnet` (5 s; nearby coins drift toward the player via `advanceItems`'s
  `MagnetPull` param and are picked up through the ordinary `checkCollision`
  path — `GAME_CONFIG.magnet.radius`/`pullSpeed` are the tuned feel values).
  A single `sim.effects` structure on the sim (`src/gameController.ts`) —
  effects never stack, re-collect refreshes duration. `CollisionEffect`
  gained the `shield`/`slow`/`magnet` members (`ENT-01`); the three items
  spawn via a new flat 0.08/row `rareItemChance` roll
  (`rollsRareItem`/`positionRareItem`) skipped on any row that already gets
  the zone's guaranteed `gem`, so the two never share the row's leading-edge
  safe-lane slot. `shieldGet`/`shieldBreak` voices (`AUD-02`); `hourglass`/
  `magnet` pickups reuse the `coin` sfx. An HUD effect indicator (🛡️/⏳/🧲
  chips, `src/App.tsx`, pushed every frame from `sim.effects` since `sim`
  isn't reactive); `entities.png` grew 80×232 → 80×280 for three new
  single-frame bands, and three new `FallbackShape` members (`roll`/
  `hourglass`/`magnet`, `src/render/shapes.ts`) — the magnet uses
  `duskPurple`/`gold` specifically to stay outside the `RND-05` rust-red
  tolerance box.

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
Everything else previously listed here was scheduled into P11 (now complete)
or P12. None of these may be implemented ahead of being scheduled into a
phase.
