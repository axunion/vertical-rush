---
id: SPEC-ENTITIES
title: Entity System (Registry, Spawning, Items)
status: partial
code: [src/entities.ts, src/gameLogic.ts, src/App.tsx]
---

# Entity System

Goal: characters, obstacles, and items are **data**, added by editing registry
tables — not by touching the loop, collision, or rendering code. Design-level
descriptions (motif, fiction) for the same ids live in `SPEC-WORLD`.

## Invariants

Status: partial — see the per-invariant markers

- `ENT-INV-1` Every spawned row leaves at least one passable lane.
  *(implemented via the safe-lane random walk in `src/entities.ts` `spawnRow`;
  preserved by construction in all future spawn logic)*
- `ENT-INV-2` A moving obstacle never enters the current safe lane while
  within 1.5 player heights (vertically) of the player row. *(planned — binds
  from the first mover in P5)*
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
spawn table)

| Module | Responsibility | Purity |
|---|---|---|
| `src/gameLogic.ts` | Existing rules + `ZONE_TABLE`-driven `calculateLevel` + `calculateScore` (`SPEC-CORE`) | pure, tested |
| `src/entities.ts` | `EntityDef` types, `ENTITY_DEFS` registry, pure spawn-row generation with an injected `rng: () => number`, `COIN_TRAIL` + the coin-trail/pickup/gem helpers; the zone-keyed `SPAWN_TABLE` | pure, tested |
| `src/sprites.ts` | Sprite-sheet manifest types + data + pure frame picking (`SPEC-RENDER › RND-04`) | pure, tested |
| `src/render.ts` | Draw dispatcher, parameterized fallback drawers, pixel pipeline, image loading (`SPEC-RENDER`) | DOM/Canvas |
| `src/audio.ts` | `createSfx` extracted from App.tsx + SFX catalog (`SPEC-AUDIO`) | Web Audio |
| `src/App.tsx` | Orchestration only: loop, input, phase signals, HUD/overlay JSX, view/feel tunables in `GAME_CONFIG` | shell |

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
// Planned additive members (do NOT implement before their roadmap phase):
//   | { kind: "shield" }   | { kind: "slow"; factor: number; durationSec: number }

export type BehaviorDef = { kind: "static" };
// Planned additive members (post-P4; parameters finalized when scheduled):
//   | { kind: "dart"; telegraphSec: number; hopSec: number }
//   | { kind: "walker"; crossSpeed: number }
//   | { kind: "roller"; speedFactor: number }

export interface EntityDef {
  id: string; // stable kebab-case slug, shared with SPEC-WORLD
  category: EntityCategory;
  size: { w: number; h: number }; // logical px (SPEC-RENDER › RND-01); also the collision Box size
  lanes: 1 | 2; // lanes occupied when spawned
  behavior: BehaviorDef;
  sprite: { sheet: string; animation: string } | null; // null = fallback-only entity
  fallback: FallbackShape; // SPEC-RENDER › RND-07
  onCollision: CollisionEffect;
}

export interface EntityInstance extends Box {
  defId: string;
  lane: number;
}
```

`FallbackShape` is owned by `SPEC-RENDER › RND-07`. Effect **resolution** (what
a hit means) is data in `onCollision`; effect **execution** (`setPhase`, sfx
calls, particles) stays in the shell — the registry never imports UI code
(`CORE-INV-2`).

## Entity registry

Status: partial — `market-crate`/`hay-cart` implemented (P2); `coin`
implemented (P4); `gem` implemented (P5, src/entities.ts ENTITY_DEFS); movers
(`stray-cat`/`chicken-flock`/`rolling-barrel`) are the rest of P5's scope,
still planned

`ENT-02` — **source of truth** for mechanical values. Ids pair 1:1 with
`SPEC-WORLD` (`WLD-01`). Sizes are logical px on the 180×320 grid
(lane width 52). Weights are relative within their zone's spawn table.

| id | category | size (w×h) | lanes | behavior | onCollision | weight | zones | phase |
|---|---|---|---|---|---|---|---|---|
| `market-crate` | obstacle | 38×24 | 1 | static | crash | 40 | all | **P2** |
| `hay-cart` | obstacle | 80×32 | 2 | static | crash | 20 | all | **P2** |
| `stray-cat` | obstacle | 16×12 | 1 | dart (telegraph 0.5 s, hop 0.3 s) | crash | 15 | old-town, market-street | P5 |
| `chicken-flock` | obstacle | 3 birds, 12×12 each | crosses all | walker | crash | 12 | old-town, market-street | P5 |
| `rolling-barrel` | obstacle | 20×20 | 1 | roller (1.5× world speed) | crash | 10 | castle-road | P5 |
| `town-guard` | obstacle | 16×24 | 1 | roller (0.6× world speed) | crash | 8 | market-street, castle-road | post-P5 |
| `fountain` | obstacle | 40×40 | 1 (center only) | static | crash | 5 | market-street | post-P5 |
| `banner-arch` | obstacle | visual 156×24; hitbox 38×24 per blocked lane | full row | static | crash | scripted | castle-road | post-P5 |
| `coin` | item | 12×12 | 1 | static | collect +10, sfx `coin` | trail rule below | all | **P4** |
| `gem` | item | 12×12 | 1 | static | collect +50, sfx `coin` | 1 per zone | all | **P5** |
| `sweet-roll` | item | 14×14 | 1 | static | shield *(planned effect)* | rare | all | post-P5 |
| `hourglass` | item | 12×16 | 1 | static | slow *(planned effect)* | rare | all | post-P5 |
| `magnet` | item | 14×12 | 1 | static | magnet *(planned effect)* | rare | all | post-P5 |

`market-crate` at 38×24 intentionally matches the current obstacle's footprint
(`laneWidth × 0.74`, aspect 0.62) so P2 changes look, not difficulty. The
current single obstacle type becomes the `market-crate` registry row; the
current `doubleChance` all-open-lanes spawn is retired in favor of `hay-cart`
occupying 2 lanes (same practical effect: one row can block 2 of 3 lanes).

`positionObstacleRow` (P5): a blockAll row whose two blocked lanes are
**adjacent** weighted-picks one 2-lane obstacle (`ENTITY_DEFS` filtered to
`lanes === 2`, currently only `hay-cart`) centered between them; non-adjacent
lanes each independently weighted-pick a 1-lane obstacle (currently only
`market-crate`). The weighted pick is keyed by `SPAWN_TABLE[zoneId].obstacles`,
so it stays a no-op today (one candidate per lane count) but needs no shell
changes when movers add more 1-lane candidates (`ENT-05`).

## Spawning

Status: partial — the zone-keyed `SPAWN_TABLE` and its consumers are
implemented (P5); movers (`ENT-INV-2`) are the remaining planned piece

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
  extensibility contract; today only one candidate exists per lane count, so
  behavior is unchanged from the pre-P5 hardcoded rule).
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
- Movers (P5, still planned) must respect `ENT-INV-2`; the spawn generator
  stays pure and deterministic given the injected rng.

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
- Effect items (`shield`, `slow`, `magnet`) are post-P5. Reserved design: a
  single `activeEffects` structure on the sim, effects never stack, re-collect
  refreshes duration. Do not build any of this before its phase.

## Extensibility contract

Status: planned (P5 proves it)

`ENT-05` — Adding a new **static obstacle or score item** touches only data:

1. Add the design row in `SPEC-WORLD` and the registry row in `ENT-02` (spec).
2. Add the `EntityDef` to `ENTITY_DEFS` and a `WeightedRef` to `SPAWN_TABLE`
   (`src/entities.ts`).
3. Optional: add sprite frames to the manifest (`src/sprites.ts`) — or set
   `sprite: null` and reuse a `FallbackShape`.

No edits to `App.tsx`, `render.ts` dispatch, or `gameLogic.ts`. A new
*behavior kind* or *effect kind* is the one case that legitimately extends the
unions and the shell's dispatch — that is a design change, not content.
P5's completion criterion is that its third obstacle lands via steps 1–3 only.
