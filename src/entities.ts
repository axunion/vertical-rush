import type { SfxId } from "./audio";
import { type Box, checkCollision, PICKUP_MARGIN_RATE } from "./gameLogic";

/** Logical-px size of Poco (RND-01), including the cake box. Not a registry entry: the player has no category. */
export const PLAYER_SIZE = { w: 24, h: 32 };

export type EntityCategory = "obstacle" | "item";

export type CollisionEffect =
  | { kind: "crash" }
  | { kind: "collect"; score: number; sfx: SfxId };

export type BehaviorDef =
  | { kind: "static" }
  | { kind: "dart"; telegraphSec: number; hopSec: number }
  | { kind: "walker"; crossSpeed: number }
  | { kind: "roller"; speedFactor: number };

export type FallbackShape =
  | "runner"
  | "crate"
  | "cart"
  | "coin"
  | "gem"
  | "cat"
  | "chicken"
  | "barrel";

export interface EntityDef {
  id: string;
  category: EntityCategory;
  size: { w: number; h: number };
  lanes: 1 | 2;
  behavior: BehaviorDef;
  sprite: { sheet: string; animation: string } | null;
  fallback: FallbackShape;
  onCollision: CollisionEffect;
}

export interface EntityInstance extends Box {
  defId: string;
  lane: number;
  /**
   * Movers only (ENT-INV-2): the lane-center x this instance drifts/hops
   * toward, its constant px/s step rate once moving, and a countdown (the
   * telegraph) before it starts, ticking down to 0/negative in
   * `advanceObstacles`. `targetX` is precomputed at spawn to never equal the
   * row's safe lane, so the invariant holds by construction — `stepMover`
   * just counts down `moveDelay` then steps toward `targetX`. Absent for
   * static entities.
   */
  targetX?: number;
  moveSpeed?: number;
  moveDelay?: number;
}

export const ENTITY_DEFS: Record<string, EntityDef> = {
  "market-crate": {
    id: "market-crate",
    category: "obstacle",
    size: { w: 38, h: 24 },
    lanes: 1,
    behavior: { kind: "static" },
    sprite: null,
    fallback: "crate",
    onCollision: { kind: "crash" },
  },
  "hay-cart": {
    id: "hay-cart",
    category: "obstacle",
    size: { w: 80, h: 32 },
    lanes: 2,
    behavior: { kind: "static" },
    sprite: null,
    fallback: "cart",
    onCollision: { kind: "crash" },
  },
  coin: {
    id: "coin",
    category: "item",
    size: { w: 12, h: 12 },
    lanes: 1,
    behavior: { kind: "static" },
    sprite: null,
    fallback: "coin",
    onCollision: { kind: "collect", score: 10, sfx: "coin" },
  },
  gem: {
    id: "gem",
    category: "item",
    size: { w: 12, h: 12 },
    lanes: 1,
    behavior: { kind: "static" },
    sprite: null,
    fallback: "gem",
    onCollision: { kind: "collect", score: 50, sfx: "coin" },
  },
  "stray-cat": {
    id: "stray-cat",
    category: "obstacle",
    size: { w: 16, h: 12 },
    lanes: 1,
    behavior: { kind: "dart", telegraphSec: 0.5, hopSec: 0.3 },
    sprite: null,
    fallback: "cat",
    onCollision: { kind: "crash" },
  },
  "chicken-flock": {
    id: "chicken-flock",
    category: "obstacle",
    size: { w: 12, h: 12 },
    lanes: 1,
    behavior: { kind: "walker", crossSpeed: 90 },
    sprite: null,
    fallback: "chicken",
    onCollision: { kind: "crash" },
  },
  "rolling-barrel": {
    id: "rolling-barrel",
    category: "obstacle",
    size: { w: 20, h: 20 },
    lanes: 1,
    behavior: { kind: "roller", speedFactor: 1.5 },
    sprite: null,
    fallback: "barrel",
    onCollision: { kind: "crash" },
  },
};

/** ENT-03: coin trail geometry, in meters measured behind the row's leading edge. Flat across zones. */
export const COIN_TRAIL = {
  count: 3,
  leadGapM: 2,
  spacingM: 1,
} as const;

/** ENT-02: chicken-flock geometry, in meters measured behind the row's leading edge (mirrors COIN_TRAIL's stagger idiom). */
export const CHICKEN_FLOCK = {
  count: 3,
  spacingM: 0.6,
} as const;

export interface WeightedRef {
  defId: string;
  weight: number;
}

export interface ZoneSpawn {
  /** Fills blocked lanes; weights from ENT-02. */
  obstacles: WeightedRef[];
  /** Probability a row also gets a coin trail. */
  itemChance: number;
  items: WeightedRef[];
}

const BASE_OBSTACLES: WeightedRef[] = [
  { defId: "market-crate", weight: 40 },
  { defId: "hay-cart", weight: 20 },
];

/**
 * old-town/market-street add the two street-life movers (ENT-02). `pickWeighted`
 * assigns each ref a contiguous sub-range of `[0, total)` in array order, so a
 * ref placed at either end of the array owns whichever sub-range touches 0 or
 * `total` — `market-crate`'s 40-weight share is split into two 20-weight refs
 * bracketing the movers so `market-crate` (not a mover) still owns *both*
 * ends of the range, same combined 40/67 probability as one entry would.
 */
const STREET_OBSTACLES: WeightedRef[] = [
  { defId: "market-crate", weight: 20 },
  { defId: "stray-cat", weight: 15 },
  { defId: "chicken-flock", weight: 12 },
  { defId: "market-crate", weight: 20 },
  { defId: "hay-cart", weight: 20 },
];

/** castle-road swaps street movers for the faster rolling-barrel (ENT-02). */
const CASTLE_ROAD_OBSTACLES: WeightedRef[] = [
  ...BASE_OBSTACLES,
  { defId: "rolling-barrel", weight: 10 },
];

const DEFAULT_ITEMS: WeightedRef[] = [{ defId: "coin", weight: 1 }];

/** ENT-05/CORE-03 — per-zone obstacle/item weights, keyed by ZONE_TABLE zone id. */
export const SPAWN_TABLE: Record<string, ZoneSpawn> = {
  "old-town": {
    obstacles: STREET_OBSTACLES,
    itemChance: 0.6,
    items: DEFAULT_ITEMS,
  },
  "market-street": {
    obstacles: STREET_OBSTACLES,
    itemChance: 0.6,
    items: DEFAULT_ITEMS,
  },
  "castle-road": {
    obstacles: CASTLE_ROAD_OBSTACLES,
    itemChance: 0.6,
    items: DEFAULT_ITEMS,
  },
};

/** Weighted random pick among `refs`, using the injected rng (deterministic under Math.random stubbing). */
export function pickWeighted(
  refs: readonly WeightedRef[],
  rng: () => number,
): string {
  const total = refs.reduce((sum, ref) => sum + ref.weight, 0);
  let roll = rng() * total;
  for (const ref of refs) {
    if (roll < ref.weight) {
      return ref.defId;
    }
    roll -= ref.weight;
  }
  return refs[refs.length - 1].defId;
}

export interface SpawnResult {
  safeLane: number;
  blockedLanes: number[];
}

/**
 * Pure spawn-row algorithm: advances the safe lane by a clamped random walk,
 * then blocks either one or all non-safe lanes. Takes an injected rng so the
 * e2e harness can stub Math.random for deterministic scenarios.
 */
export function spawnRow(
  laneCount: number,
  safeLane: number,
  doubleChance: number,
  rng: () => number,
): SpawnResult {
  const step = Math.floor(rng() * 3) - 1;
  const nextSafeLane = Math.min(laneCount - 1, Math.max(0, safeLane + step));
  const openLanes: number[] = [];
  for (let lane = 0; lane < laneCount; lane++) {
    if (lane !== nextSafeLane) {
      openLanes.push(lane);
    }
  }
  const blockAll = openLanes.length > 1 && rng() < doubleChance;
  const blockedLanes = blockAll
    ? openLanes
    : [openLanes[Math.floor(rng() * openLanes.length)]];
  return { safeLane: nextSafeLane, blockedLanes };
}

/**
 * Builds positioned obstacle instances for a row's blocked lanes, weighted-
 * picking from the zone's `SPAWN_TABLE` obstacles (ENT-05): two adjacent
 * blocked lanes get one 2-lane obstacle centered between them; otherwise
 * each blocked lane independently gets its own 1-lane obstacle.
 */
/** Builds an instance of `defId` in `lane`, centered on `centerX`, at the row's leading edge. */
function placeAtLeadingEdge(
  defId: string,
  lane: number,
  centerX: number,
): EntityInstance {
  const def = ENTITY_DEFS[defId];
  return {
    defId,
    lane,
    x: centerX - def.size.w / 2,
    y: -def.size.h,
    width: def.size.w,
    height: def.size.h,
  };
}

/**
 * ENT-INV-2: picks the lane a mover settles into once it hops/drifts away
 * from `lane` — an inbounds neighbor that isn't `safeLane` — or `lane` itself
 * if no such neighbor exists (the mover then doesn't move sideways at all).
 * With `laneCount` 3 this always resolves deterministically: `lane`'s two
 * neighbors can include at most one out-of-bounds lane and the safe lane is
 * never `lane` itself, so exactly zero or one candidate remains.
 */
function moverTargetLane(
  lane: number,
  safeLane: number,
  laneCount: number,
): number {
  const candidates = [lane - 1, lane + 1].filter(
    (l) => l >= 0 && l < laneCount && l !== safeLane,
  );
  return candidates.length > 0 ? candidates[0] : lane;
}

/** Attaches dart hop timing to a freshly-placed instance of a "dart"-behavior entity (ENT-INV-2: no-op if `moverTargetLane` found no safe hop target). */
function attachDartMotion(
  instance: EntityInstance,
  def: EntityDef,
  behavior: Extract<BehaviorDef, { kind: "dart" }>,
  lane: number,
  safeLane: number,
  laneCount: number,
  laneCenterX: (lane: number) => number,
): void {
  const targetLane = moverTargetLane(lane, safeLane, laneCount);
  if (targetLane === lane) {
    return;
  }
  instance.targetX = placeAtLeadingEdge(
    def.id,
    targetLane,
    laneCenterX(targetLane),
  ).x;
  instance.moveSpeed =
    Math.abs(instance.targetX - instance.x) / behavior.hopSec;
  instance.moveDelay = behavior.telegraphSec;
}

/**
 * Builds CHICKEN_FLOCK.count staggered instances of a "walker"-behavior
 * entity behind the row's leading edge (mirrors `positionCoinTrail`'s
 * vertical stagger), all sharing one drift target lane (ENT-INV-2, via
 * `moverTargetLane`).
 */
function positionChickenFlock(
  def: EntityDef,
  behavior: Extract<BehaviorDef, { kind: "walker" }>,
  lane: number,
  safeLane: number,
  laneCount: number,
  laneCenterX: (lane: number) => number,
  pxPerMeter: number,
): EntityInstance[] {
  const targetLane = moverTargetLane(lane, safeLane, laneCount);
  const spawnX = placeAtLeadingEdge(def.id, lane, laneCenterX(lane)).x;
  const targetX =
    targetLane === lane
      ? spawnX
      : placeAtLeadingEdge(def.id, targetLane, laneCenterX(targetLane)).x;
  return Array.from({ length: CHICKEN_FLOCK.count }, (_, i) => ({
    defId: def.id,
    lane,
    x: spawnX,
    y: -i * CHICKEN_FLOCK.spacingM * pxPerMeter - def.size.h,
    width: def.size.w,
    height: def.size.h,
    targetX,
    moveSpeed: behavior.crossSpeed,
    moveDelay: 0,
  }));
}

export function positionObstacleRow(
  zoneId: string,
  blockedLanes: readonly number[],
  safeLane: number,
  laneCount: number,
  laneCenterX: (lane: number) => number,
  pxPerMeter: number,
  rng: () => number,
): EntityInstance[] {
  const refs = SPAWN_TABLE[zoneId].obstacles;
  const twoLaneRefs = refs.filter((r) => ENTITY_DEFS[r.defId].lanes === 2);
  const oneLaneRefs = refs.filter((r) => ENTITY_DEFS[r.defId].lanes === 1);

  if (
    blockedLanes.length === 2 &&
    Math.abs(blockedLanes[0] - blockedLanes[1]) === 1 &&
    twoLaneRefs.length > 0
  ) {
    const centerX =
      (laneCenterX(blockedLanes[0]) + laneCenterX(blockedLanes[1])) / 2;
    return [
      placeAtLeadingEdge(
        pickWeighted(twoLaneRefs, rng),
        Math.min(blockedLanes[0], blockedLanes[1]),
        centerX,
      ),
    ];
  }
  return blockedLanes.flatMap((lane) => {
    const defId = pickWeighted(oneLaneRefs, rng);
    const def = ENTITY_DEFS[defId];
    const behavior = def.behavior;
    if (behavior.kind === "walker") {
      return positionChickenFlock(
        def,
        behavior,
        lane,
        safeLane,
        laneCount,
        laneCenterX,
        pxPerMeter,
      );
    }
    const instance = placeAtLeadingEdge(defId, lane, laneCenterX(lane));
    if (behavior.kind === "dart") {
      attachDartMotion(
        instance,
        def,
        behavior,
        lane,
        safeLane,
        laneCount,
        laneCenterX,
      );
    }
    return [instance];
  });
}

/** Steps a mover's x toward `targetX` at `moveSpeed` px/s once the `moveDelay` countdown (the telegraph) reaches 0; a no-op for static entities (no `targetX`). */
function stepMover(obs: EntityInstance, dt: number): void {
  if (obs.targetX === undefined || obs.moveSpeed === undefined) {
    return;
  }
  if (obs.moveDelay !== undefined && obs.moveDelay > 0) {
    obs.moveDelay -= dt;
    if (obs.moveDelay > 0) {
      return;
    }
  }
  const dir = Math.sign(obs.targetX - obs.x);
  if (dir === 0) {
    return;
  }
  obs.x += dir * obs.moveSpeed * dt;
  if ((dir > 0 && obs.x >= obs.targetX) || (dir < 0 && obs.x <= obs.targetX)) {
    obs.x = obs.targetX;
  }
}

/**
 * Scrolls obstacles by `scroll` (rollers use `speedFactor`x that, ENT-02),
 * steps any mover's lateral position, drops ones that left the view, and
 * reports whether any remaining obstacle now overlaps the player (via the
 * shared `checkCollision`, per CORE-INV-1 — no second hit-detection path).
 * `dt`/`defs` default to a no-op mover step and the real registry, so
 * existing static-only call sites are unaffected.
 */
export function advanceObstacles(
  obstacles: EntityInstance[],
  scroll: number,
  viewHeight: number,
  player: Box,
  dt = 0,
  defs: Record<string, EntityDef> = ENTITY_DEFS,
): boolean {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    const behavior = defs[obs.defId]?.behavior;
    const speedFactor = behavior?.kind === "roller" ? behavior.speedFactor : 1;
    obs.y += scroll * speedFactor;
    stepMover(obs, dt);
    if (obs.y > viewHeight) {
      obstacles.splice(i, 1);
      continue;
    }
    if (checkCollision(player, obs)) {
      return true;
    }
  }
  return false;
}

/**
 * ENT-03: whether a spawned row also gets a coin trail, given the zone's
 * `itemChance` (SPAWN_TABLE) and the injected rng — mirrors `spawnRow`'s
 * `doubleChance` roll so the e2e harness's `Math.random` stubbing keeps
 * producing deterministic runs.
 */
export function rollsCoinTrail(itemChance: number, rng: () => number): boolean {
  return rng() < itemChance;
}

/**
 * Builds a single gem instance in `lane` at the row's leading edge (ENT-02).
 */
export function positionGem(
  lane: number,
  laneCenterX: (lane: number) => number,
): EntityInstance {
  return placeAtLeadingEdge("gem", lane, laneCenterX(lane));
}

/**
 * ENT-02: exactly one gem per zone, guaranteed once `distance` passes the
 * zone's midpoint, as long as that zone hasn't already been gemmed.
 */
export function shouldSpawnGem(
  zoneId: string,
  distance: number,
  zoneMidpoint: number,
  gemZonesSeen: ReadonlySet<string>,
): boolean {
  return !gemZonesSeen.has(zoneId) && distance >= zoneMidpoint;
}

/**
 * Builds a trail of `COIN_TRAIL.count` coins in the row's safe lane, spaced
 * `COIN_TRAIL.spacingM` meters apart starting `COIN_TRAIL.leadGapM` meters
 * behind the row's leading edge (ENT-03). Always the safe lane, so pickup
 * stays optional by construction (ENT-INV-3).
 */
export function positionCoinTrail(
  safeLane: number,
  laneCenterX: (lane: number) => number,
  pxPerMeter: number,
): EntityInstance[] {
  const def = ENTITY_DEFS.coin;
  const x = laneCenterX(safeLane) - def.size.w / 2;
  return Array.from({ length: COIN_TRAIL.count }, (_, i) => {
    const metersBehind = COIN_TRAIL.leadGapM + i * COIN_TRAIL.spacingM;
    return {
      defId: "coin",
      lane: safeLane,
      x,
      y: -metersBehind * pxPerMeter - def.size.h,
      width: def.size.w,
      height: def.size.h,
    };
  });
}

export interface CollectedItem {
  defId: string;
  score: number;
  sfx: SfxId;
}

/**
 * Scrolls item instances by `scroll`, drops ones that left the view, and
 * removes any overlapping the player under the generous pickup margin
 * (ENT-04, via the shared `checkCollision` — CORE-INV-1). Reports each
 * collected item's score/sfx so the shell can score it and play audio; the
 * run never stops for an item (ENT-INV-3).
 */
export function advanceItems(
  items: EntityInstance[],
  scroll: number,
  viewHeight: number,
  player: Box,
): CollectedItem[] {
  const collected: CollectedItem[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    item.y += scroll;
    if (item.y > viewHeight) {
      items.splice(i, 1);
      continue;
    }
    if (checkCollision(player, item, PICKUP_MARGIN_RATE)) {
      const effect = ENTITY_DEFS[item.defId].onCollision;
      if (effect.kind === "collect") {
        collected.push({
          defId: item.defId,
          score: effect.score,
          sfx: effect.sfx,
        });
      }
      items.splice(i, 1);
    }
  }
  return collected;
}
