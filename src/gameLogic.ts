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
export const TARGET_DISTANCE = 240;

/**
 * Collision margin rate (0-1).
 * Each box is shrunk inward by this rate of its width/height before testing.
 * E.g. 0.2 shrinks 10% on each side, horizontally and vertically.
 */
export const COLLISION_MARGIN_RATE = 0.2;

/** Item pickup margin rate (ENT-04): more generous than COLLISION_MARGIN_RATE. */
export const PICKUP_MARGIN_RATE = 0.1;

/** Distance (m) before the first row spawns (CORE-03). */
export const SPAWN_GAP = {
  initialDelay: 6,
} as const;

export interface ZoneDef {
  id: string;
  level: number;
  upTo: number;
  speed: number;
  spawnGap: { from: number; to: number };
}

/** CORE-03 — source of truth for zone values. */
export const ZONE_TABLE: readonly ZoneDef[] = [
  {
    id: "old-town",
    level: 1,
    upTo: 50,
    speed: 7,
    spawnGap: { from: 7, to: 6 },
  },
  {
    id: "market-street",
    level: 2,
    upTo: 150,
    speed: 10,
    spawnGap: { from: 6.5, to: 5.5 },
  },
  {
    id: "castle-road",
    level: 3,
    upTo: Infinity,
    speed: 13,
    spawnGap: { from: 6, to: 5.5 },
  },
];

export interface ZoneRange {
  zone: ZoneDef;
  /** Distance (m) the zone starts at. */
  start: number;
  /** Distance (m) the zone's spawn-gap ramp finishes at; the last (Infinite) zone's ramp ends at TARGET_DISTANCE. */
  end: number;
}

/** Resolves the zone active at `distance`, plus its ramp bounds (CORE-03). */
export function zoneRangeAt(distance: number): ZoneRange {
  const d = Math.max(0, distance);
  const index = ZONE_TABLE.findIndex((z) => d <= z.upTo);
  const zone = ZONE_TABLE[index === -1 ? ZONE_TABLE.length - 1 : index];
  const start = index <= 0 ? 0 : ZONE_TABLE[index - 1].upTo;
  const end = Number.isFinite(zone.upTo) ? zone.upTo : TARGET_DISTANCE;
  return { zone, start, end };
}

export function calculateLevel(distance: number): LevelInfo {
  const { zone } = zoneRangeAt(distance);
  return { level: zone.level, speed: zone.speed };
}

/** Meters until the next row spawns: linear ramp across the active zone's spawnGap (CORE-03). */
export function spawnGapForZone(distance: number): number {
  const { zone, start, end } = zoneRangeAt(distance);
  const span = end - start;
  const t = span > 0 ? Math.min(1, Math.max(0, (distance - start) / span)) : 1;
  return zone.spawnGap.from + (zone.spawnGap.to - zone.spawnGap.from) * t;
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
