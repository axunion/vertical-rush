import { TARGET_DISTANCE } from "./gameLogic";
import type { RenderColors, ZoneBlend } from "./render";

export const GAME_CONFIG = {
  targetDistance: TARGET_DISTANCE,
  laneCount: 3,
  /** Fixed logical-pixel grid: sim/drawing coordinates never depend on window size. */
  logical: { w: 180, h: 320, roadPad: 12 },
  /** Fraction of the view height scrolled per second at speed 1. */
  speedRatio: 0.11,
  playerYRatio: 0.78,
  laneEaseRate: 10,
  /** How long the "switch" sprite animation plays after a lane change before reverting to "run". */
  playerSwitchDuration: 0.22,
  spawn: { doubleChance: 0.45 },
  particles: {
    dustMax: 70,
    dustPerSecond: 60,
    dust: {
      driftX: 25,
      fallSpeed: [45, 125],
      life: [0.35, 0.65],
      size: [1, 2.5],
    },
    spark: {
      count: 30,
      speed: [60, 250],
      lift: 30,
      life: [0.5, 0.9],
      size: [1, 2],
      gravity: 350,
    },
    itemBurst: {
      count: 10,
      speed: [30, 90],
      lift: 15,
      life: [0.25, 0.4],
      size: [1, 2],
      gravity: 0,
    },
  },
  speedLines: {
    count: 12,
    length: [15, 60],
    speedFactor: 1.6,
    idleSpeed: 0.5,
  },
  idle: { scrollRatio: 0.06, animRate: 0.8 },
  /** P11 magnet effect (item onCollision carries its durationSec; radius/pullSpeed are feel tunables, not entity data). */
  magnet: { radius: 50, pullSpeed: 220 },
  shake: { duration: 0.45, magnitude: 7 },
  bannerDuration: 0.8,
  /** Road/sky crossfade duration on a zone change. */
  zoneCrossfadeDuration: 1.2,
  /** Input lockout after entering a terminal phase, absorbing trailing panic taps from the crash. */
  retryLockout: 0.4,
  font: '"DotGothic16", "Avenir Next", Futura, "Trebuchet MS", sans-serif',
  colors: {
    ink: "#33272E",
    duskPurple: "#5B4A68",
    cobbleMid: "#8D7B84",
    cobbleLight: "#B5A6A8",
    parchment: "#F4E3C1",
    warmWhite: "#FFF7E6",
    rustRed: "#D95763",
    terracotta: "#C65B41",
    gold: "#F2B63D",
    woodBrown: "#8A5A3B",
    leafGreen: "#6DA34D",
    duskTeal: "#3E6B73",
  },
} as const;

/** Road+sky colors per zone, crossfaded over `zoneCrossfadeDuration` on a zone change. Replaces the single flat road entries in `GAME_CONFIG.colors` for these three keys. */
export const ZONE_PALETTES: Record<
  string,
  Pick<RenderColors, "cobbleMid" | "cobbleLight" | "duskPurple">
> = {
  "old-town": {
    // golden afternoon — matches GAME_CONFIG.colors' base values.
    cobbleMid: "#8D7B84",
    cobbleLight: "#B5A6A8",
    duskPurple: "#5B4A68",
  },
  "market-street": {
    // saturated: warmer curb (awning/lantern glow).
    cobbleMid: "#967D6E",
    cobbleLight: "#C4A16B",
    duskPurple: "#4A3A52",
  },
  "castle-road": {
    // dusk: cooler road, deeper sky, torch-glow accents.
    cobbleMid: "#6E6478",
    cobbleLight: "#9088A6",
    duskPurple: "#332B4A",
  },
};

/** Each zone's fully-merged steady-state colors, precomputed once so a mid-run frame outside a crossfade never re-spreads `GAME_CONFIG.colors` (60x/sec). */
export const ZONE_STEADY_COLORS: Record<string, RenderColors> =
  Object.fromEntries(
    Object.entries(ZONE_PALETTES).map(([zoneId, palette]) => [
      zoneId,
      { ...GAME_CONFIG.colors, ...palette },
    ]),
  );

/** Each zone's steady-state `ZoneBlend` (fromZoneId === toZoneId, t: 1), precomputed for the same reason as `ZONE_STEADY_COLORS`. */
export const ZONE_STEADY_BLEND: Record<string, ZoneBlend> = Object.fromEntries(
  Object.keys(ZONE_PALETTES).map((zoneId) => [
    zoneId,
    { fromZoneId: zoneId, toZoneId: zoneId, t: 1 },
  ]),
);

export type GamePhase = "ready" | "running" | "cleared" | "gameover";

/** The localStorage key for the persisted best score. */
export const BEST_SCORE_KEY = "vertical-rush.best";
