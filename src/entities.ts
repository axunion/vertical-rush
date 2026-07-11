import type { SfxId } from "./audio";
import { type Box, checkCollision, PICKUP_MARGIN_RATE } from "./gameLogic";

/** Logical-px size of Poco (RND-01), including the cake box. Not a registry entry: the player has no category. */
export const PLAYER_SIZE = { w: 24, h: 32 };

export type EntityCategory = "obstacle" | "item";

export type CollisionEffect =
  | { kind: "crash" }
  | { kind: "collect"; score: number; sfx: SfxId };

export type BehaviorDef = { kind: "static" };

export type FallbackShape = "runner" | "crate" | "cart" | "coin";

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
};

/** ENT-03: probability a spawned row also gets a coin trail in its safe lane. */
export const ITEM_CHANCE = 0.6;

/** ENT-03: coin trail geometry, in meters measured behind the row's leading edge. */
export const COIN_TRAIL = {
  count: 3,
  leadGapM: 2,
  spacingM: 1,
} as const;

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
 * Builds positioned obstacle instances for a row's blocked lanes (ENT-02 P2
 * interim rule): two adjacent blocked lanes render as one `hay-cart`
 * centered between them; otherwise each blocked lane gets its own
 * `market-crate`. This is the interim stand-in for the registry-driven
 * SPAWN_TABLE that arrives in P5.
 */
export function positionObstacleRow(
  blockedLanes: readonly number[],
  laneCenterX: (lane: number) => number,
): EntityInstance[] {
  const cart = ENTITY_DEFS["hay-cart"];
  if (
    blockedLanes.length === cart.lanes &&
    Math.abs(blockedLanes[0] - blockedLanes[1]) === 1
  ) {
    const centerX =
      (laneCenterX(blockedLanes[0]) + laneCenterX(blockedLanes[1])) / 2;
    return [
      {
        defId: "hay-cart",
        lane: Math.min(blockedLanes[0], blockedLanes[1]),
        x: centerX - cart.size.w / 2,
        y: -cart.size.h,
        width: cart.size.w,
        height: cart.size.h,
      },
    ];
  }
  const def = ENTITY_DEFS["market-crate"];
  return blockedLanes.map((lane) => ({
    defId: "market-crate",
    lane,
    x: laneCenterX(lane) - def.size.w / 2,
    y: -def.size.h,
    width: def.size.w,
    height: def.size.h,
  }));
}

/**
 * Scrolls obstacles by `scroll`, drops ones that left the view, and reports
 * whether any remaining obstacle now overlaps the player (via the shared
 * `checkCollision`, per CORE-INV-1 — no second hit-detection path).
 */
export function advanceObstacles(
  obstacles: EntityInstance[],
  scroll: number,
  viewHeight: number,
  player: Box,
): boolean {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.y += scroll;
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
 * ENT-03: whether a spawned row also gets a coin trail, given the injected
 * rng — mirrors `spawnRow`'s `doubleChance` roll so the e2e harness's
 * `Math.random` stubbing keeps producing deterministic runs.
 */
export function rollsCoinTrail(rng: () => number): boolean {
  return rng() < ITEM_CHANCE;
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
        collected.push({ score: effect.score, sfx: effect.sfx });
      }
      items.splice(i, 1);
    }
  }
  return collected;
}
