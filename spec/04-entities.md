---
id: SPEC-ENTITIES
title: Entity System (Registry, Spawning, Items)
status: partial
code: [src/entities.ts, src/gameLogic.ts, src/gameController.ts, src/App.tsx]
---

# Entity System

Goal: characters, obstacles, and items are **data**, added by editing registry
tables — not by touching the loop, collision, or rendering code. Design-level
descriptions (motif, fiction) for the same ids live in `SPEC-WORLD`.

## Invariants

Status: implemented — see the per-invariant markers

- `ENT-INV-1` Every spawned row leaves at least one passable lane.
  *(implemented via the safe-lane random walk in `src/entities.ts` `spawnRow`;
  preserved by construction in all future spawn logic)*
- `ENT-INV-2` A moving obstacle never enters the current safe lane while
  within 1.5 player heights (vertically) of the player row. *(implemented,
  P5: `src/entities.ts` `moverTargetLane` computes each mover's post-motion
  lane at spawn time as an inbounds neighbor that isn't the row's safe lane —
  or the mover's own lane if no such neighbor exists, so it simply doesn't
  move sideways. The final resting x is fixed well before the mover's slow
  telegraph/hop/drift completes and it scrolls into range of the player, so
  the invariant holds by construction, the same pattern `ENT-INV-1`/
  `ENT-INV-3` already use)*
- `ENT-INV-3` Items are always optional: collecting requires a deliberate lane
  choice and skipping one is never punished. Items spawn only in the safe lane
  of their row. *(implemented — `src/entities.ts` `positionCoinTrail` and
  `positionGem` always place in the row's safe lane; `advanceItems` only ever
  removes items, never blocks progress)*

## Target module layout

Status: implemented — modules, the canonical logical-px `EntityDef.size`
schema, `src/sprites.ts`, the pure score helper, `ZONE_TABLE`-driven
`calculateLevel`, and the zone-keyed `SPAWN_TABLE` are all implemented (P1
extraction, P2 canonical schema, P3 sprite manifest, P4 score, P5 zones +
spawn table); the `src/render/` split and the `config.ts`/`zoneVisuals.ts`/
`gameController.ts` extraction from `App.tsx` are P9's second extraction pass

| Module | Responsibility | Purity |
|---|---|---|
| `src/gameLogic.ts` | Existing rules + `ZONE_TABLE`-driven `calculateLevel` + `calculateScore` (`SPEC-CORE`) | pure, tested |
| `src/entities.ts` | `EntityDef` types, `ENTITY_DEFS` registry, pure spawn-row generation with an injected `rng: () => number`, `COIN_TRAIL` + the coin-trail/pickup/gem helpers; the zone-keyed `SPAWN_TABLE` | pure, tested |
| `src/sprites.ts` | Sprite-sheet manifest types + data + pure frame picking (`SPEC-RENDER › RND-04`) | pure, tested |
| `src/render/` | Draw dispatcher, parameterized fallback drawers, pixel pipeline, image loading (`SPEC-RENDER`), split (P9) into `types.ts`/`helpers.ts`/`display.ts`/`sheets.ts`/`particles.ts` (no top-level DOM — node-importable, some now unit-tested) and `road.ts`/`landmarks.ts`/`shapes.ts`/`entities-draw.ts`/`frame.ts` (hold the module-level `CanvasPattern`/`DOMMatrix` caches), plus an `index.ts` barrel re-exporting the pre-P9 public surface | DOM/Canvas (`index.ts`/`road.ts`/`landmarks.ts`/`shapes.ts`/`entities-draw.ts`/`frame.ts`); pure (`types.ts`/`helpers.ts`/`display.ts`/`sheets.ts`/`particles.ts`) |
| `src/audio.ts` | `createSfx` extracted from App.tsx + SFX catalog (`SPEC-AUDIO`) | Web Audio |
| `src/config.ts` | `GAME_CONFIG`, `ZONE_PALETTES`/`ZONE_STEADY_COLORS`/`ZONE_STEADY_BLEND`, `GamePhase`, `BEST_SCORE_KEY` — extracted from App.tsx (P9) | pure, data-only |
| `src/zoneVisuals.ts` | Pure `frameZoneBlend`/`frameColors` zone-crossfade helpers, taking distance/fade state as explicit params instead of closing over `sim` — extracted from App.tsx (P9) | pure, tested |
| `src/gameController.ts` | `createGameController`: owns the per-frame `sim` blob and every update/spawn/collision/finish-run step; Solid-free — `sfx` and the phase/score signal accessors are injected as explicit parameters (`GameControllerHooks`), not imported — extracted from App.tsx (P9) | Solid-free (uses `Math.random`/`localStorage`, no `window`/`document`/Canvas/SolidJS) |
| `src/App.tsx` | Orchestration only: loop, input, phase signals, HUD/overlay JSX, `resize`/canvas wiring, wires `gameController`'s hooks to Solid signals | shell |

The rng injection exists so the e2e harness's `Math.random` stubbing keeps
producing deterministic runs — the shell passes `Math.random` in production.

## Canonical types

Status: implemented (src/entities.ts)

`ENT-01` — Canonical (target: `src/entities.ts`):

```ts
import type { Box } from "./gameLogic";
import type { SfxId } from "./audio"; // SPEC-AUDIO › AUD-02

export type EntityCategory = "obstacle" | "item";

export type CollisionEffect =
  | { kind: "crash" } // ends the run: gameover phase, crash sfx, shake, sparks
  | { kind: "collect"; score: number; sfx: SfxId }; // removes the instance, adds score
// Planned additive members (P11 — do NOT implement before that phase):
//   | { kind: "shield" }
//   | { kind: "slow"; factor: number; durationSec: number }
//   | { kind: "magnet"; durationSec: number } // pull radius tuned during P11

export type BehaviorDef =
  | { kind: "static" }
  | { kind: "dart"; telegraphSec: number; hopSec: number } // stray-cat: crouch, then hop toward `targetX`
  | { kind: "walker"; crossSpeed: number } // chicken-flock: constant px/s drift toward `targetX`
  | { kind: "roller"; speedFactor: number }; // rolling-barrel: scrolls at speedFactor x the base scroll

export interface EntityDef {
  id: string; // stable kebab-case slug, shared with SPEC-WORLD
  category: EntityCategory;
  size: { w: number; h: number }; // logical px (SPEC-RENDER › RND-01); also the collision Box size
  lanes: 1 | 2; // lanes occupied when spawned
  behavior: BehaviorDef;
  sprite: { sheet: string; animation: string } | null; // null = fallback-only entity
  fallback: FallbackShape; // SPEC-RENDER › RND-07
  onCollision: CollisionEffect;
  laneRestriction?: "center"; // P10: static obstacles only — eligible in the weighted pick only for this lane (fountain)
}

export interface EntityInstance extends Box {
  defId: string;
  lane: number;
  // Movers only (ENT-INV-2); absent for static entities. `targetX` is
  // precomputed at spawn by `moverTargetLane` to never equal the row's safe
  // lane, so the invariant holds by construction.
  moveTime?: number;
  targetX?: number;
  moveSpeed?: number;
  moveDelay?: number;
}
```

`FallbackShape` is owned by `SPEC-RENDER › RND-07`. Effect **resolution** (what
a hit means) is data in `onCollision`; effect **execution** (`setPhase`, sfx
calls, particles) stays in the shell — the registry never imports UI code
(`CORE-INV-2`).

## Entity registry

Status: partial — `market-crate`/`hay-cart` implemented (P2); `coin`
implemented (P4); `gem` implemented (P5); movers (`stray-cat`/
`chicken-flock`/`rolling-barrel`) implemented (P5, `src/entities.ts`
`ENTITY_DEFS`, `moverTargetLane`, `attachDartMotion`, `positionChickenFlock`,
`stepMover`); `town-guard`/`fountain`/`banner-arch` implemented (P10,
`src/entities.ts` `ENTITY_DEFS`, the `laneRestriction` field,
`shouldSpawnBannerArch`, `positionBannerArchRow`); `sweet-roll`/`hourglass`/
`magnet` planned (P11)

`ENT-02` — **source of truth** for mechanical values. Ids pair 1:1 with
`SPEC-WORLD` (`WLD-01`). Sizes are logical px on the 180×320 grid
(lane width 52). Weights are relative within their zone's spawn table.

| id | category | size (w×h) | lanes | behavior | onCollision | weight | zones | phase |
|---|---|---|---|---|---|---|---|---|
| `market-crate` | obstacle | 38×24 | 1 | static | crash | 40 | all | **P2** |
| `hay-cart` | obstacle | 80×32 | 2 | static | crash | 20 | all | **P2** |
| `stray-cat` | obstacle | 16×12 | 1 | dart (telegraph 0.5 s, hop 0.3 s) | crash | 15 | old-town, market-street | **P5** |
| `chicken-flock` | obstacle | 3 birds, 12×12 each, staggered `CHICKEN_FLOCK.spacingM` (0.6 m) apart | 1 (each bird) | walker (crossSpeed 90 px/s) | crash | 12 | old-town, market-street | **P5** |
| `rolling-barrel` | obstacle | 20×20 | 1 | roller (speedFactor 1.5×) | crash | 10 | castle-road | **P5** |
| `town-guard` | obstacle | 16×24 | 1 | roller (0.6× world speed) | crash | 8 | market-street, castle-road | **P10** |
| `fountain` | obstacle | 40×40 | 1 (`laneRestriction: "center"`) | static | crash | 5 | market-street | **P10** |
| `banner-arch` | obstacle | 38×24 per blocked-lane hitbox | 1 (scripted, one per non-safe lane) | static | crash | scripted (not weighted) | castle-road | **P10** |
| `coin` | item | 12×12 | 1 | static | collect +10, sfx `coin` | trail rule below | all | **P4** |
| `gem` | item | 12×12 | 1 | static | collect +50, sfx `coin` | 1 per zone | all | **P5** |
| `sweet-roll` | item | 14×14 | 1 | static | shield *(planned effect)* | rare | all | P11 |
| `hourglass` | item | 12×16 | 1 | static | slow *(planned effect)* | rare | all | P11 |
| `magnet` | item | 14×12 | 1 | static | magnet *(planned effect)* | rare | all | P11 |

`market-crate` at 38×24 intentionally matches the current obstacle's footprint
(`laneWidth × 0.74`, aspect 0.62) so P2 changes look, not difficulty. The
current single obstacle type becomes the `market-crate` registry row; the
current `doubleChance` all-open-lanes spawn is retired in favor of `hay-cart`
occupying 2 lanes (same practical effect: one row can block 2 of 3 lanes).

`positionObstacleRow` (P5): a blockAll row whose two blocked lanes are
**adjacent** weighted-picks one 2-lane obstacle (`ENTITY_DEFS` filtered to
`lanes === 2`, currently only `hay-cart`) centered between them; non-adjacent
lanes each independently weighted-pick a 1-lane obstacle. The weighted pick is
keyed by `SPAWN_TABLE[zoneId].obstacles`, so adding `stray-cat`/
`chicken-flock`/`rolling-barrel` as more 1-lane candidates needed no change to
this dispatch shape (`ENT-05`) — only two additive branches: a `stray-cat`
pick attaches dart-hop motion (`attachDartMotion`) to the single placed
instance, and a `chicken-flock` pick calls `positionChickenFlock` to return
`CHICKEN_FLOCK.count` staggered instances instead of one. The function's
signature grew `safeLane`/`laneCount`/`pxPerMeter` params to support this —
existing static-only obstacles ignore them. P10 added one more per-lane
filter, not a new dispatch branch: a candidate one-lane ref is excluded
unless its `EntityDef.laneRestriction` (if set) matches the lane being
filled — `fountain`'s `"center"` restriction is the only user today.
`town-guard` (an ordinary `roller` ref) needed no dispatch change at all,
which is `ENT-05`'s data-only proof.

Placement rules for the P10 rows (implemented):

- `fountain`: restricted via the `laneRestriction: "center"` filter above —
  eligible only when the lane being filled equals
  `Math.floor(laneCount / 2)`.
- `banner-arch`: not a weighted pick. `src/gameController.ts`
  `spawnObstacleRow` calls `shouldSpawnBannerArch(zone.id, Math.random)`
  before the normal obstacle placement; when it rolls true (`castle-road`
  only, a flat chance), `positionBannerArchRow` replaces the row's obstacles
  with one 38×24 `banner-arch` hitbox per non-safe lane — always the full
  row minus the safe lane, regardless of `spawnRow`'s own `doubleChance`
  roll — so `ENT-INV-1` holds by construction the same way `spawnRow`'s own
  blockAll case does. Each hitbox is authored as its own 38×24 sprite
  segment rather than one continuous 156-wide image (`SPEC-RENDER ›
  RND-08`): reusing the generic per-instance sprite/fallback dispatch
  (`RND-06`) needs no new rendering machinery, and adjacent segments still
  read as one banner when two lanes are blocked.

## Spawning

Status: implemented — the zone-keyed `SPAWN_TABLE`, its consumers, and movers
(`ENT-INV-2`) are all implemented (P5); `town-guard`/`fountain`/`banner-arch`
spawn rules implemented (P10)

Canonical (`src/entities.ts`):

```ts
export interface WeightedRef {
  defId: string;
  weight: number;
}

export interface ZoneSpawn {
  obstacles: WeightedRef[]; // fills blocked lanes; weights from ENT-02
  itemChance: number; // probability a row also gets a coin trail
  items: WeightedRef[];
}

export const SPAWN_TABLE: Record<string /* zone id, SPEC-CORE › CORE-03 */, ZoneSpawn> = {
  /* one entry per zone */
};
```

- Safe lane does a clamped random walk per row: `step ∈ {-1, 0, +1}` uniform
  (`spawnRow`).
- With probability `doubleChance` (0.45) all non-safe lanes are blocked;
  otherwise one random non-safe lane is blocked (`spawnRow`).
- Rows spawn on a distance schedule: see `SPEC-CORE › zones` for the per-zone
  spawn-gap ramp (`spawnGapForZone`), after an initial 6 m delay.
- Off-screen obstacles (below the view) are removed each frame
  (`advanceObstacles`).
- Blocked lanes are filled by `positionObstacleRow`, weighted-picking from
  `SPAWN_TABLE[zoneId].obstacles` filtered to the lane count needed (`ENT-05`
  extensibility contract). `old-town`/`market-street` add `stray-cat`/
  `chicken-flock` to the base `market-crate`/`hay-cart` pool; `castle-road`
  adds `rolling-barrel` instead. `market-street`/`castle-road` additionally
  add `town-guard` (P10), and `market-street` adds the center-lane-only
  `fountain` (P10). `castle-road` rows may instead be scripted as a
  `banner-arch` row (P10) — see the placement rules below.
- `ENT-03` **Coin trail rule** (`src/entities.ts` `COIN_TRAIL`,
  `positionCoinTrail`, `rollsCoinTrail`): when a row rolls under the active
  zone's `SPAWN_TABLE[zoneId].itemChance` (0.6, flat across zones today),
  place a trail of `COIN_TRAIL.count` (3) `coin` instances in that row's
  **safe lane**: the first coin `COIN_TRAIL.leadGapM` (2 m) behind the row
  (further from the player), the rest spaced `COIN_TRAIL.spacingM` (1 m)
  apart. Coins therefore softly signpost the safe lane — onboarding and
  reward in one mechanic, and `ENT-INV-3` holds by construction. The trail
  geometry (`COIN_TRAIL`) stays flat across zones; only `itemChance` is
  per-zone data.
- `ENT-02` **gem placement**: exactly one `gem` per zone, guaranteed (not a
  weighted roll like `items`) once distance passes the zone's midpoint
  (`zoneRangeAt` start/end averaged), placed in that row's safe lane
  (`shouldSpawnGem`, `positionGem`) — `ENT-INV-3` holds by construction, same
  as the coin trail.
- 2-lane entities (`hay-cart`) require 2 adjacent non-safe lanes; when the
  safe lane is the center lane, fall back to a 1-lane pick.
- **Movers** (P5, `src/entities.ts` `moverTargetLane`/`attachDartMotion`/
  `positionChickenFlock`/`stepMover`): a picked mover's post-motion lane is
  `moverTargetLane(lane, safeLane, laneCount)` — an inbounds neighbor of its
  spawn lane that isn't the row's safe lane, or its own lane if no such
  neighbor exists (it then simply doesn't move sideways). This is computed
  once at spawn, so `ENT-INV-2` holds by construction, the same pattern
  `ENT-INV-1`/`ENT-INV-3` already use — no runtime distance-to-player check is
  needed.
  - `stray-cat` (dart): stays at its spawn x for `telegraphSec` (0.5 s), then
    moves to `targetX` over `hopSec` (0.3 s) at a constant px/s rate.
  - `chicken-flock` (walker): spawns `CHICKEN_FLOCK.count` (3) birds in the
    same lane, staggered `CHICKEN_FLOCK.spacingM` (0.6 m) apart behind the
    row's leading edge (mirrors `COIN_TRAIL`'s stagger), each drifting toward
    the same shared `targetX` at a constant `crossSpeed` (90 px/s) with no
    telegraph delay.
  - `rolling-barrel` (roller): no lateral motion; `advanceObstacles` scrolls
    it at `speedFactor` (1.5×) the base scroll instead of 1×, so it closes
    distance on the player faster than the world scroll ("fast approach").
  - All three keep the spawn generator pure and deterministic given the
    injected rng; `dt`-driven position stepping lives in `advanceObstacles`,
    which defaults `dt`/`defs` so pre-existing static-only call sites are
    unaffected.

## Collection mechanics

Status: implemented (P4: src/entities.ts advanceItems, src/gameLogic.ts
checkCollision marginRate + PICKUP_MARGIN_RATE, src/App.tsx collectItems; P5:
gem support via CollectedItem.defId)

- `ENT-04` Item pickup reuses `checkCollision` with the generous margin
  `PICKUP_MARGIN_RATE = 0.1` via the optional parameter from
  `SPEC-CORE › CORE-02` — items are easier to grab than obstacles are to hit
  (a smaller shrink leaves bigger effective boxes). No second collision path
  exists (`CORE-INV-1`).
- On collect: `advanceItems` removes the instance and reports its
  `defId`/`onCollision.score`/`sfx`; `src/App.tsx` `collectItems` adds the
  score to the run's collected score (`SPEC-CORE › CORE-04`) regardless of
  item type, plays the sfx, and emits a small particle burst
  (`GAME_CONFIG.particles.itemBurst`, gold for `coin` / dusk-teal for `gem`).
  The HUD's 🪙 counter only counts `defId === "coin"` pickups — `gem` adds to
  the score total without incrementing it. The run never stops for an item.
- Effect items (`shield`, `slow`, `magnet`) are planned (P11). Contract: a
  single `activeEffects` structure on the sim; effects never stack;
  re-collect refreshes duration; values per `SPEC-WORLD › Item cast` (shield
  absorbs exactly one hit — `shieldBreak` sfx instead of gameover; slow
  ×0.6 for 3 s; magnet 5 s). The magnet pull radius and the HUD effect
  indicator are tuned/designed during P11. Do not build any of this
  before P11.

## Extensibility contract

Status: implemented (P10 — proven by `town-guard`, which landed via steps
1–3 alone: an `EntityDef` in `ENTITY_DEFS` plus a `WeightedRef` in
`market-street`/`castle-road`'s `SPAWN_TABLE` pools, with zero edits to
`src/gameController.ts`, `src/render/entities-draw.ts`, or `src/gameLogic.ts`)

`ENT-05` — Adding a new **static obstacle or score item** touches only data:

1. Add the design row in `SPEC-WORLD` and the registry row in `ENT-02` (spec).
2. Add the `EntityDef` to `ENTITY_DEFS` and a `WeightedRef` to `SPAWN_TABLE`
   (`src/entities.ts`).
3. Optional: add sprite frames to the manifest (`src/sprites.ts`) — or set
   `sprite: null` and reuse a `FallbackShape`.

No edits to `src/gameController.ts`, `src/render/entities-draw.ts` (the
render dispatch), or `gameLogic.ts`. A new *behavior kind* or *effect kind* is
the one case that legitimately extends the unions and the shell's dispatch —
that is a design change, not content. P5 shipped its new entities via that
carve-out (see the P5 note in `SPEC-ROADMAP › Completed phases (P0–P10)`), so
the data-only path needed a future entity that lands via steps 1–3 alone to
prove it — `town-guard` did exactly that in P10 (an ordinary `roller`
`WeightedRef`, no new behavior/effect kind, no dispatch edits). A new
`FallbackShape` drawer is the `RND-07`-sanctioned rare addition and does not
void the claim: the contract governs the loop, collision, and dispatch code,
not fallback art — P10 added three such drawers (`guard`/`fountain`/`banner`)
alongside `town-guard`/`fountain`/`banner-arch` without touching the loop,
collision, or dispatch.

## Sprite binding

Status: implemented (P7, src/entities.ts ENTITY_DEFS, src/sprites.ts SPRITE_SHEETS.entities; extended P10)

`ENT-06` — Every `ENTITY_DEFS` row binds to the `entities` sprite sheet
(`SPEC-RENDER › RND-08`) as `sprite: { sheet: "entities", animation: <its own
id> }`; the sheet defines one looping animation per entity, keyed by entity
id. Rules:

- Every frame referenced by an entity's animation has `w`/`h` exactly equal
  to that entity's `ENT-02` `size` — the sprite is never scaled, and the
  fallback shape already draws the same Box (`RND-INV-1`), so collision feel
  is identical with or without the PNG.
- `sprite: null` remains legal and is the required state for entities whose
  sheet band is not yet specified in `RND-08` — today's 7 `ENTITY_DEFS` rows
  are all bound; a future entity lands `sprite: null` until its band is added.
- Unit tests enforce the binding: each non-null `sprite` resolves to an
  existing sheet + animation, and each referenced frame matches `def.size`
  and stays inside the sheet bounds.
