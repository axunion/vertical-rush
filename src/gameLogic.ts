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

function shrink(box: Box): Box {
  return {
    x: box.x + (box.width * COLLISION_MARGIN_RATE) / 2,
    y: box.y + (box.height * COLLISION_MARGIN_RATE) / 2,
    width: box.width * (1 - COLLISION_MARGIN_RATE),
    height: box.height * (1 - COLLISION_MARGIN_RATE),
  };
}

export function checkCollision(player: Box, obstacle: Box): boolean {
  const a = shrink(player);
  const b = shrink(obstacle);
  return (
    a.x + a.width > b.x &&
    b.x + b.width > a.x &&
    a.y + a.height > b.y &&
    b.y + b.height > a.y
  );
}
