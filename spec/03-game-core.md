---
id: SPEC-CORE
title: Game Core (Simulation Contract)
status: partial
code: [src/gameLogic.ts, src/App.tsx]
---

# Game Core

The simulation contract: what the run *is*, independent of how it is drawn.

## Invariants

Status: partial — see the per-invariant markers

- `CORE-INV-1` All collision decisions go through `checkCollision`
  (`src/gameLogic.ts`). Never reimplement hit detection. *(implemented)*
- `CORE-INV-2` Pure modules (`src/gameLogic.ts`; later `src/entities.ts`,
  `src/sprites.ts`) have no UI dependencies and run under Vitest's node
  environment. Logic changes are made test-first. *(implemented for gameLogic)*
- `CORE-INV-3` Distance is the sole clear condition; items and score never
  gate progress. *(implemented — `isGameCleared` only ever checks distance;
  `calculateScore` is display-only and never consulted by the clear check)*

## Phases

Status: implemented (src/App.tsx GamePhase)

`ready → running → (cleared | gameover)`; both terminal phases return to
`running` via the start/retry button (which resets the sim). Rules:

- `CORE-01` Reaching the goal wins over a same-frame collision: the clear
  check runs before the collision scan in the frame update.
- Input (pointer taps on screen halves, ArrowLeft/ArrowRight) moves lanes only
  during `running`; lane index clamps to `[0, laneCount-1]`.
- A non-`running` phase still animates an idle/attract scene.

## Units and scrolling

Status: implemented (src/App.tsx updateGame, pxPerUnit)

- The player is fixed on screen; the world scrolls down.
- Distance advances `speed * dt` meters per frame; distance is clamped to
  `TARGET_DISTANCE` (500, `src/gameLogic.ts`).
- Pixel scroll per frame = `speed * pxPerUnit() * dt`, where
  `pxPerUnit = viewHeight * GAME_CONFIG.speedRatio` (0.11). Since the pixel
  pipeline landed (`SPEC-RENDER › RND-02`), `viewHeight` is the fixed logical
  320; the mapping itself is otherwise unchanged.
- `dt` is clamped to 0.05 s per frame.

## Collision

Status: implemented (src/gameLogic.ts checkCollision, COLLISION_MARGIN_RATE)

AABB overlap after shrinking **both** boxes inward by
`COLLISION_MARGIN_RATE = 0.2` of their width/height (10% per side). This
forgiveness factor is deliberate game feel — do not change it casually.

`CORE-02` *(implemented, P4: src/gameLogic.ts checkCollision,
PICKUP_MARGIN_RATE)*: `checkCollision` gains an optional third parameter
`marginRate = COLLISION_MARGIN_RATE` so item pickup can use a **more generous**
margin (`SPEC-ENTITIES › ENT-04`) without a second collision path. The
two-argument call keeps today's behavior exactly, so existing call sites and
tests are unaffected.

## Zones (level & difficulty table)

Status: implemented (P5: src/gameLogic.ts ZONE_TABLE, zoneRangeAt, calculateLevel, spawnGapForZone)

`calculateLevel(distance)` derives from `ZONE_TABLE`, keeping the exact same
thresholds, speeds, and signature the hardcoded-tier version had (existing
boundary tests in `src/gameLogic.test.ts` remain valid unmodified) — the table
adds a world identity per tier.

`CORE-03` — **source of truth** for zone values:

| zone id | level | range (m) | speed (m/s) | spawn gap (m, ramp within zone) | palette shift |
|---|---|---|---|---|---|
| `old-town` | 1 | 0 ≤ d ≤ 100 | 5 | 8 → 7 | golden afternoon |
| `market-street` | 2 | 100 < d ≤ 300 | 8 | 7 → 6 | saturated: awnings, lantern strings |
| `castle-road` | 3 | 300 < d | 12 | 6 → 5.5 | dusk: cool road, torch-glow accents |

Boundary semantics match the implemented code: bounds are **inclusive upper**
(`d <= 100` is still `old-town`), and the last zone extends beyond 500 m. Since
`castle-road`'s `upTo` is `Infinity`, its spawn-gap ramp (and the `zoneMidpoint`
that `SPEC-ENTITIES › ENT-02` gem placement uses) has no natural end distance;
`zoneRangeAt` caps it at `TARGET_DISTANCE` (500), giving it the same 200 m ramp
span as `market-street` and reaching `5.5` exactly at the goal.

Canonical types (target: `src/gameLogic.ts`):

```ts
export interface ZoneDef {
  id: string;
  level: number; // 1-based, equals today's LevelInfo.level
  upTo: number; // inclusive upper bound in meters; Infinity for the last zone
  speed: number; // m/s
  spawnGap: { from: number; to: number }; // meters between rows, linear ramp across the zone
}

export const ZONE_TABLE: readonly ZoneDef[] = [
  { id: "old-town", level: 1, upTo: 100, speed: 5, spawnGap: { from: 8, to: 7 } },
  { id: "market-street", level: 2, upTo: 300, speed: 8, spawnGap: { from: 7, to: 6 } },
  { id: "castle-road", level: 3, upTo: Infinity, speed: 12, spawnGap: { from: 6, to: 5.5 } },
];
```

`calculateLevel(distance)` keeps its exact signature (`LevelInfo`), derived
from `ZONE_TABLE` — call sites in `src/App.tsx` and the level banner do not
change. Adding a fourth zone later is a table edit plus new boundary tests.

**Implemented spawn cadence**: rows spawn every `spawnGapForZone(distance)`
meters — a linear ramp between the active zone's `spawnGap.from`/`.to` across
its start/end span (`zoneRangeAt`) — after an initial 6 m delay
(`SPAWN_GAP.initialDelay`, `src/gameLogic.ts`; called from `src/App.tsx`
`updateGame`). This replaces the old flat per-level formula
(`spawnGapForLevel`, removed).

## Zone transitions

Status: planned (P5); the 1.2 s banner + levelUp jingle are implemented today

On crossing a zone boundary: keep the existing banner (retitled
`ZONE 2 — MARKET STREET` / `SPEED UP!`) and levelUp jingle, add a 2 s linear
crossfade of road/curb colors between the zones' palettes, and scroll one
landmark prop past (town gate arch → market banner → castle wall corner).
Zone palettes live in a per-zone color block replacing today's single
`GAME_CONFIG.colors` road entries.

## Score

Status: implemented (P4: src/gameLogic.ts calculateScore, src/App.tsx)

`CORE-04` — `score = floor(distance) + Σ collected item scores`. Distance
remains the sole clear condition (`CORE-INV-3`); score is display and replay
value only.

- Computed by the pure helper `calculateScore(distance: number,
  collectedScore: number): number` in `src/gameLogic.ts`.
- HUD gains a coin counter next to the distance readout; result overlays show
  distance / coins / total score.
- Best-score persistence to `localStorage` is a small post-P4 follow-up, not
  part of the initial item phase.
