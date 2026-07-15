import type { EntityDef, EntityInstance } from "../entities";
import type { Box } from "../gameLogic";

/** Fixed logical-pixel geometry (RND-01) — computed once, never touched by resize. */
export interface View {
  w: number;
  h: number;
  roadPad: number;
  laneWidth: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface SpeedLine {
  x: number;
  y: number;
  length: number;
}

/** The 12-color Karamell palette (WLD-02 source of truth). */
export interface RenderColors {
  ink: string;
  duskPurple: string;
  cobbleMid: string;
  cobbleLight: string;
  parchment: string;
  warmWhite: string;
  rustRed: string;
  terracotta: string;
  gold: string;
  woodBrown: string;
  leafGreen: string;
  duskTeal: string;
}

/** SPEC-CORE zone transitions / RND-09 tile crossfade: the zone-transition blend state, shared by the palette crossfade (`RenderColors`) and the `town.png` tile crossfade. */
export interface ZoneBlend {
  fromZoneId: string;
  toZoneId: string;
  /** 0 = fully `fromZoneId`, 1 = fully `toZoneId` (steady state). */
  t: number;
}

export interface DisplayFit {
  cssW: number;
  cssH: number;
  backingW: number;
  backingH: number;
  k: number;
  dx: number;
  dy: number;
}

export interface OffscreenSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Sheet id -> loaded image, or null if that sheet failed to load or hasn't resolved yet. */
export type SheetImages = Record<string, HTMLImageElement | null>;

export interface DustConfig {
  driftX: number;
  fallSpeed: readonly [number, number];
  life: readonly [number, number];
  size: readonly [number, number];
}

export interface SparkConfig {
  count: number;
  speed: readonly [number, number];
  lift: number;
  life: readonly [number, number];
  size: readonly [number, number];
  gravity: number;
}

export type PlayerAnimState = "idle" | "run" | "switch" | "crash" | "victory";

export interface FrameSim {
  bgOffset: number;
  distance: number;
  obstacles: readonly EntityInstance[];
  items: readonly EntityInstance[];
  dust: readonly Particle[];
  itemBurst: readonly Particle[];
  sparks: readonly Particle[];
  speedLines: readonly SpeedLine[];
  animTime: number;
  bannerTime: number;
  shakeTime: number;
  playerAnimState: PlayerAnimState;
  /** Elapsed time since `playerAnimState` last changed — drives sprite frameAt for non-looping states. */
  playerAnimStateTime: number;
  playerFacing: 1 | -1;
}

export interface FrameConfig {
  targetDistance: number;
  speedRatio: number;
  playerYRatio: number;
  laneCount: number;
  shake: { duration: number; magnitude: number };
  bannerDuration: number;
  font: string;
  colors: RenderColors;
  /** Drives the `town.png` road/curb crossfade (RND-09); mirrors the palette crossfade already captured in `colors`. */
  zoneBlend: ZoneBlend;
}

export interface RenderFrameArgs {
  view: View;
  sim: FrameSim;
  player: Box;
  level: number;
  config: FrameConfig;
  /** Registry to resolve each obstacle's `EntityDef` by `defId` (injected, not imported, so this stays testable against any registry — entity data, owned by entities.ts, not a GAME_CONFIG tunable). */
  defs: Record<string, EntityDef>;
  /** Loaded sprite sheet images, keyed by sheet id; missing/failed sheets are `null` (RND-INV-1). */
  sheets: SheetImages;
}
