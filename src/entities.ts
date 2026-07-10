import { type Box, checkCollision } from "./gameLogic";

export type Obstacle = Box & { lane: number };

/**
 * Interim ratio-based sizing (P1). Replaced by the canonical logical-px
 * `EntityDef.size` schema in P2 (SPEC-ENTITIES › ENT-01).
 */
export interface EntityDef {
  id: string;
  widthRatio: number; // relative to lane width
  aspect: number; // height / width
}

export const ENTITY_DEFS: Record<"player" | "obstacle", EntityDef> = {
  player: { id: "player", widthRatio: 0.5, aspect: 1.2 },
  obstacle: { id: "obstacle", widthRatio: 0.74, aspect: 0.62 },
};

export function obstacleSize(laneWidth: number): {
  width: number;
  height: number;
} {
  const width = laneWidth * ENTITY_DEFS.obstacle.widthRatio;
  return { width, height: width * ENTITY_DEFS.obstacle.aspect };
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

/** Builds positioned obstacle instances for a row's blocked lanes. */
export function positionObstacleRow(
  lanes: readonly number[],
  laneWidth: number,
  laneCenterX: (lane: number) => number,
): Obstacle[] {
  const { width, height } = obstacleSize(laneWidth);
  return lanes.map((lane) => ({
    lane,
    x: laneCenterX(lane) - width / 2,
    y: -height,
    width,
    height,
  }));
}

/**
 * Remaps existing obstacles to new view geometry in place (window resize /
 * orientation change) so drawing and checkCollision stay aligned.
 */
export function remapObstacles(
  obstacles: Obstacle[],
  laneWidth: number,
  laneCenterX: (lane: number) => number,
  prevViewHeight: number,
  nextViewHeight: number,
): void {
  const { width, height } = obstacleSize(laneWidth);
  for (const obs of obstacles) {
    obs.x = laneCenterX(obs.lane) - width / 2;
    obs.y = (obs.y / prevViewHeight) * nextViewHeight;
    obs.width = width;
    obs.height = height;
  }
}

/**
 * Scrolls obstacles by `scroll`, drops ones that left the view, and reports
 * whether any remaining obstacle now overlaps the player (via the shared
 * `checkCollision`, per CORE-INV-1 — no second hit-detection path).
 */
export function advanceObstacles(
  obstacles: Obstacle[],
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
