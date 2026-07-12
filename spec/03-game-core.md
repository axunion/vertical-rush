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

Status: partial — machine and CORE-01 implemented (src/App.tsx GamePhase);
CORE-05 instant retry planned (P6)

`ready → running → (cleared | gameover)`; both terminal phases return to
`running` via the start/retry button (which resets the sim). Rules:

- `CORE-01` Reaching the goal wins over a same-frame collision: the clear
  check runs before the collision scan in the frame update.
- Input (pointer taps on screen halves, ArrowLeft/ArrowRight) moves lanes only
  during `running`; lane index clamps to `[0, laneCount-1]`.
- A non-`running` phase still animates an idle/attract scene.
- `CORE-05` *(planned, P6)* **Instant retry**: on entering a terminal phase,
  input locks for `GAME_CONFIG.retryLockout` (0.4 s — absorbs trailing panic
  taps from the crash and matches the shake settling); after the lockout, any
  pointer tap on the play area or any keypress restarts straight into
  `running` (never back through `ready`). The first-launch `ready` screen
  stays and additionally accepts tap-anywhere; the overlay start/retry button
  stays as the accessible path. Details: `SPEC-ROADMAP › P6`.

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

**P6 retune (planned):** the short-run redesign replaces these values
(`TARGET_DISTANCE` 240, zone bounds 50/150, speeds 7/10/13 — full table in
`SPEC-ROADMAP › P6`). The table above stays the source of truth for the
implemented code until the P6 commit swaps both together.

**Implemented spawn cadence**: rows spawn every `spawnGapForZone(distance)`
meters — a linear ramp between the active zone's `spawnGap.from`/`.to` across
its start/end span (`zoneRangeAt`) — after an initial 6 m delay
(`SPAWN_GAP.initialDelay`, `src/gameLogic.ts`; called from `src/App.tsx`
`updateGame`). This replaces the old flat per-level formula
(`spawnGapForLevel`, removed).

## Zone transitions

Status: implemented (P5: src/App.tsx ZONE_PALETTES, sim.zoneFadeFrom/
zoneFadeTime, frameColors; src/render.ts lerpHexColor, drawBanner,
ZONE_LANDMARKS/drawZoneLandmark, drawCastleGate)

On crossing a zone boundary: the existing 1.2 s banner (retitled
`ZONE 2 — MARKET STREET` / `SPEED UP!`, via `src/render.ts` `drawBanner`
looking up the zone name from `ZONE_TABLE`) and levelUp jingle fire as before;
additionally, a 2 s linear crossfade (`GAME_CONFIG.zoneCrossfadeDuration`,
`src/render.ts` `lerpHexColor`) blends the road/curb/sky colors
(`cobbleMid`/`cobbleLight`/`duskPurple`) from the previous zone's
`ZONE_PALETTES` entry to the new one's; and one landmark prop scrolls past,
keyed to the same `ZONE_TABLE` boundary distances a `drawGoalLine`-style
distance-to-screen-y computation uses (`src/render.ts` `ZONE_LANDMARKS`,
`drawZoneLandmark`): a town gate arch at old-town's exit (100 m), a market
banner at market-street's exit (300 m). Zone palettes live in
`src/App.tsx` `ZONE_PALETTES`, a per-zone color block that only overrides the
three road/sky keys — all other `GAME_CONFIG.colors` entries (entity colors,
UI) stay flat across zones per `WLD-02`.

**P6 retune (planned):** the banner shortens to 0.8 s and the crossfade to
1.2 s to fit the compressed run (`SPEC-ROADMAP › P6`).

The castle-gate goal (`SPEC-WORLD › WLD-05`) is drawn by the same function
that used to be the plain checkered goal line, now `src/render.ts`
`drawCastleGate`: flanking stone towers with a flat-color torch-flame accent
(no blur, per `RND-07`'s no-gradient rule) plus the original checkered
drawbridge-deck threshold strip. Poco's `victory` animation still plays in
front of it on clear (unchanged from `SPEC-WORLD › Protagonist`).

## Score

Status: partial — CORE-04 implemented (P4: src/gameLogic.ts calculateScore,
src/App.tsx); CORE-06 best score planned (P6)

`CORE-04` — `score = floor(distance) + Σ collected item scores`. Distance
remains the sole clear condition (`CORE-INV-3`); score is display and replay
value only.

- Computed by the pure helper `calculateScore(distance: number,
  collectedScore: number): number` in `src/gameLogic.ts`.
- HUD gains a coin counter next to the distance readout; result overlays show
  distance / coins / total score.

`CORE-06` *(planned, P6)* — **Best score**: the highest final score persists
in `localStorage` under the key `vertical-rush.best`; read once on mount and
written on run end, both inside try/catch (private-mode safe, default 0);
shown on both result overlays. Lives entirely in `src/App.tsx`
(`CORE-INV-2`); it never gates progress (`CORE-INV-3`).
