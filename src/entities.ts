import type { SfxId } from "./audio";
import { type Box, checkCollision } from "./gameLogic";

/** Logical-px size of Poco (RND-01), including the cake box. Not a registry entry: the player has no category. */
export const PLAYER_SIZE = { w: 24, h: 32 };

export type EntityCategory = "obstacle" | "item";

export type CollisionEffect =
  | { kind: "crash" }
  | { kind: "collect"; score: number; sfx: SfxId };

export type BehaviorDef = { kind: "static" };

export type FallbackShape = "runner" | "crate" | "cart";

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
};

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
 * SPAWN_TABLE that arrives in P4.
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
