---
id: SPEC-ROADMAP
title: Implementation Roadmap
status: partial
code: []
---

# Implementation Roadmap

Ordered phases from the current neon-highway build to the pixel-art fantasy
town with items. Each phase is **independently shippable**: the game is
complete-feeling at every phase boundary. Do not start a phase's scope early;
specs mark deferred work as `planned (Pn)` for a reason.

Every phase ends with the same verification triplet:

1. `pnpm test` — all unit tests green.
2. `pnpm check` — Biome + `tsc -b` green.
3. The `verify` skill (`.claude/skills/verify/SKILL.md`) — both deterministic
   scenarios: `Math.random = () => 0.4` (idle player clears at 500 m) and
   `Math.random = () => 0.9` (crash within ~5 s).

Completion additionally requires flipping the relevant `Status:` lines in
these specs from `planned (Pn)` to `implemented (module symbol)` in the same
commit — that is what keeps spec/code drift structurally bounded.

## P0 — Specification suite

Status: implemented (this directory)

Write `spec/` (this document set), amend `CLAUDE.md` (tunables ownership rule,
spec-sync rule, spec/ pointer), mention `spec/` in the root README. No code
changes.

## P1 — Extraction (zero behavior change)

Status: implemented

**Scope:** split `src/App.tsx` (879 lines) into the target module layout
(`SPEC-ENTITIES › target module layout`): extract `src/audio.ts` (`createSfx`
+ `SfxId`), `src/render.ts` (draw dispatch, the pixel/viewport setup helpers,
and the particle/speed-line system), and `src/entities.ts` (the current
player + obstacle become the first registry entries; `spawnRow` becomes a
pure function taking an injected `rng`, alongside `advanceObstacles`,
`positionObstacleRow`, and `remapObstacles`). The spawn-cadence formula
(`SPEC-CORE › zones`) also moves out of `App.tsx`'s `GAME_CONFIG.spawn` into
`SPAWN_GAP`/`spawnGapForLevel` in `src/gameLogic.ts`, since it's a difficulty
value per `OVR-INV-1`. Interim registry note: P1 keeps today's ratio-based
sizing (`widthRatio`/`aspect`) so behavior is untouched;
the canonical logical-px `size` schema arrives with P2.

**Completion criteria:**
- `src/App.tsx` substantially reduced and orchestration only: game
  loop/input/lifecycle glue, `GAME_CONFIG` (view/feel/particle tunables per
  `OVR-INV-1`), and HUD/overlay JSX — all rendering, audio, and entity logic
  extracted. In practice this floor (config data + JSX + the per-frame
  update) lands around 450 lines, not the originally-stated 300; the
  criterion is "no orchestration-unrelated logic left in App.tsx", not a hard
  line count.
- Behavior is pixel-identical in intent: no tunable value changes, all
  existing tests pass **unmodified**.
- `CLAUDE.md` architecture section updated to the new module list.

**Verification:** the triplet; the verify skill must pass with **no edits** to
the skill file (proves behavior didn't change).

## P2 — Pixel pipeline + fantasy re-theme (fallback art)

Status: implemented

**Scope:** implement `SPEC-RENDER › RND-01/02/03` (180×320 offscreen canvas,
integer scaling, letterboxing, smoothing off, logical-pixel coordinates and
the canonical `EntityDef.size` schema); redraw all fallback drawers as chunky
pixel shapes (`RND-07`); swap the palette to Karamell (`SPEC-WORLD › WLD-02`):
cobblestone road, hedge/stone curbs, `market-crate` + `hay-cart` looks,
Poco fallback runner with the rust-red scarf.

**Completion criteria:**
- No smoothing artifacts at DPR 2×/3×; letterboxing correct on non-9:16
  windows; playable with zero assets (`RND-INV-1`).
- `market-crate` footprint matches the old obstacle (38×24) — difficulty
  unchanged.
- Player key color contract in place (`RND-05`).

**Verification:** **update the verify skill's color constant to `#D95763`
first**, then the triplet; manual screenshot review at 390×844.

## P3 — Sprite-sheet pipeline

Status: implemented

**Scope:** `src/sprites.ts` manifest + `frameAt` (unit-tested for loop/clamp);
per-sheet loader; dispatcher prefers sprites over fallback (`RND-06`); author
and ship `public/assets/sheets/poco.png` (`RND-04` layout) at minimum; retire
`GAME_CONFIG.assets`.

**Completion criteria:**
- Poco animates from the sheet when present (idle/run/switch/crash/victory).
- Deleting `public/assets/` still yields a fully playable, coherent game
  (`RND-INV-1`).
- `frameAt` covered by unit tests.

**Verification:** the triplet, run **twice** — with assets present and with
`public/assets/` temporarily moved away.

## P4 — Items & collection

Status: implemented

**Scope:** `coin` entity (`SPEC-ENTITIES › ENT-02`), the `itemChance` 0.6
coin-trail rule (`ENT-03`) via a flat `ITEM_CHANCE` constant and `COIN_TRAIL`
geometry (the zone-keyed `SPAWN_TABLE` itself waits on P5's table-driven
zones; P5 later replaced flat `ITEM_CHANCE` with per-zone
`SPAWN_TABLE[zoneId].itemChance`, removing the constant), pickup margin
parameter on `checkCollision` (`SPEC-CORE › CORE-02`, test-first), pure score
helper (`CORE-04`, test-first), `coin` SFX (`SPEC-AUDIO › AUD-02`), gold
collect particles, coin counter in the HUD and results.

**Completion criteria:**
- Collecting a coin raises score and never interrupts the run; crash path
  unchanged; two-argument `checkCollision` behavior unchanged.
- `ENT-INV-1` and `ENT-INV-3` hold by construction.

**Verification:** the triplet plus new unit tests for score and pickup margin;
verify-skill scenario with a deterministic rng that routes the player over a
coin trail and asserts the HUD counter.

## P5 — Content & difficulty pass

Status: implemented

**Scope:**
- Table-driven zones (`SPEC-CORE › CORE-03` `ZONE_TABLE`, test-first rewrite
  of the tier boundary tests) and the per-zone spawn-gap ramp replacing the
  legacy gap formula. *(implemented: `src/gameLogic.ts` `ZONE_TABLE`,
  `zoneRangeAt`, `spawnGapForZone`)*
- The zone-keyed `SPAWN_TABLE` (weighted obstacle fill via `positionObstacleRow`,
  per-zone `itemChance`) and the `gem` item (guaranteed one per zone, safe
  lane). *(implemented: `src/entities.ts` `SPAWN_TABLE`, `pickWeighted`,
  `positionGem`, `shouldSpawnGem`)*
- Zone transition presentation (palette crossfade, landmark props,
  castle-gate goal — `SPEC-CORE › zone transitions`, `WLD-05`). *(implemented:
  `src/App.tsx` `ZONE_PALETTES`/`frameColors`; `src/render.ts`
  `lerpHexColor`, `ZONE_LANDMARKS`/`drawZoneLandmark`, `drawCastleGate`,
  `drawBanner`'s zone-name retitle)*
- Movers (`stray-cat`, `chicken-flock`, `rolling-barrel` with `ENT-INV-2`).
  *(implemented: `src/entities.ts` `BehaviorDef` dart/walker/roller,
  `moverTargetLane`, `attachDartMotion`, `positionChickenFlock`, `stepMover`;
  `src/render.ts` `cat`/`chicken`/`barrel` fallback shapes)*
- SFX additions (clear bell, crash noise), BGM (`AUD-03`). *(implemented:
  `src/audio.ts` createSfx's clear bell/gameOver noise burst,
  `startBgm`/`setBgmZone`/`setBgmDucked`/`stopBgm`)*

**Completion criteria:**
- Zone boundaries and speeds match `CORE-03` exactly (boundary tests updated
  test-first against the table).
- At least one of the new entities lands via the data-only path — proving the
  extensibility contract `ENT-05` (steps 1–3, no shell/render edits).
- Each new entity has a distinct, cataloged SFX where the design calls for it.

**Verification:** the triplet; full-run verify scenario: start → zone banners
at 100 m/300 m → collect → crash → retry → clear at the castle gate.

## Post-P5 backlog (unscheduled)

Status: planned (unscheduled)

Effect items (`sweet-roll`, `hourglass`, `magnet` — `SPEC-ENTITIES ›
collection mechanics`), `town-guard`/`fountain`/`banner-arch`, ambient audio
(`AUD-04`), authored audio files, best-score persistence, pixel font, endless
mode after clear. None of these may be implemented ahead of being scheduled
into a phase.
