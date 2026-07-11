export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LevelInfo {
  level: number;
  speed: number;
}

/** Target distance (m). Used for the clear condition. */
export const TARGET_DISTANCE = 500;

/**
 * Collision margin rate (0-1).
 * Each box is shrunk inward by this rate of its width/height before testing.
 * E.g. 0.2 shrinks 10% on each side, horizontally and vertically.
 */
export const COLLISION_MARGIN_RATE = 0.2;

/** Item pickup margin rate (ENT-04): more generous than COLLISION_MARGIN_RATE. */
export const PICKUP_MARGIN_RATE = 0.1;

/** Distance (m) before the first row spawns, and the per-level row-gap ramp. */
export const SPAWN_GAP = {
  initialDelay: 6,
  baseGap: 8,
  gapPerLevel: 1.2,
  minGap: 5.5,
} as const;

/** Meters between spawned rows at the given level: 8 / 6.8 / 5.6 at levels 1/2/3. */
export function spawnGapForLevel(level: number): number {
  return Math.max(
    SPAWN_GAP.minGap,
    SPAWN_GAP.baseGap - (level - 1) * SPAWN_GAP.gapPerLevel,
  );
}

export function calculateLevel(distance: number): LevelInfo {
  const d = Math.max(0, distance);
  if (d <= 100) {
    return { level: 1, speed: 5 };
  }
  if (d <= 300) {
    return { level: 2, speed: 8 };
  }
  return { level: 3, speed: 12 };
}

export function isGameCleared(distance: number, target: number): boolean {
  return distance >= target;
}

/** Distance's floor plus any collected item scores (CORE-04); score is display-only, never a clear condition. */
export function calculateScore(
  distance: number,
  collectedScore: number,
): number {
  return Math.floor(distance) + collectedScore;
}

function shrink(box: Box, marginRate: number): Box {
  return {
    x: box.x + (box.width * marginRate) / 2,
    y: box.y + (box.height * marginRate) / 2,
    width: box.width * (1 - marginRate),
    height: box.height * (1 - marginRate),
  };
}

/**
 * AABB overlap after shrinking both boxes inward by `marginRate` of their
 * width/height. Defaults to the obstacle margin; item pickup passes the
 * more generous `PICKUP_MARGIN_RATE` (ENT-04) through this same path
 * (CORE-INV-1 — no second collision path).
 */
export function checkCollision(
  player: Box,
  obstacle: Box,
  marginRate: number = COLLISION_MARGIN_RATE,
): boolean {
  const a = shrink(player, marginRate);
  const b = shrink(obstacle, marginRate);
  return (
    a.x + a.width > b.x &&
    b.x + b.width > a.x &&
    a.y + a.height > b.y &&
    b.y + b.height > a.y
  );
}
