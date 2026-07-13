import type { EntityDef, EntityInstance, FallbackShape } from "./entities";
import { type Box, ZONE_TABLE } from "./gameLogic";
import {
  type FrameRect,
  frameAt,
  SPRITE_SHEETS,
  type SpriteSheetDef,
  TILE_SHEETS,
} from "./sprites";

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

/**
 * Shared Map-cache idiom: return the cached value for `key`, else `compute`
 * it and store it. A `null` result (a canvas/pattern build failure) is never
 * cached, so a transient failure gets retried next call instead of sticking.
 */
function cachedBy<V>(cache: Map<string, V>, key: string, compute: () => V): V {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const value = compute();
  cache.set(key, value);
  return value;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

const alphaCache = new Map<string, string>();

/** Memoized: called every frame with a fixed set of palette hex/alpha pairs. */
function withAlpha(hex: string, alpha: number): string {
  return cachedBy(alphaCache, `${hex}|${alpha}`, () => {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
}

/** Linearly interpolates two `#RRGGBB` colors at `t` in [0,1] — the zone-transition palette crossfade (`SPEC-CORE › zone transitions`). */
export function lerpHexColor(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(pa.r, pb.r)}${channel(pa.g, pb.g)}${channel(pa.b, pb.b)}`;
}

/** The 1px ink outline shared by every chunky pixel shape (RND-07). */
function strokeInset(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
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

/** Fits the 9:16-style playfield inside the available box, then picks the largest integer scale (RND-02). */
export function computeDisplayFit(
  maxW: number,
  maxH: number,
  logicalW: number,
  logicalH: number,
  dpr: number,
): DisplayFit {
  const aspect = logicalW / logicalH;
  let cssW = maxW;
  let cssH = maxW / aspect;
  if (cssH > maxH) {
    cssH = maxH;
    cssW = maxH * aspect;
  }
  cssW = Math.round(cssW);
  cssH = Math.round(cssH);
  const backingW = Math.round(cssW * dpr);
  const backingH = Math.round(cssH * dpr);
  const k = Math.max(
    1,
    Math.floor(Math.min(backingW / logicalW, backingH / logicalH)),
  );
  const dx = Math.floor((backingW - logicalW * k) / 2);
  const dy = Math.floor((backingH - logicalH * k) / 2);
  return { cssW, cssH, backingW, backingH, k, dx, dy };
}

/** Backing-store size = CSS size x DPR; resizing a canvas resets its context state (RND-03). */
export function sizeDisplayCanvas(
  canvasEl: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  fit: DisplayFit,
): void {
  canvasEl.style.width = `${fit.cssW}px`;
  canvasEl.style.height = `${fit.cssH}px`;
  canvasEl.width = fit.backingW;
  canvasEl.height = fit.backingH;
  ctx.imageSmoothingEnabled = false;
}

export interface OffscreenSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Creates the fixed 180x320 logical-pixel drawing surface (RND-01); never resized. */
export function createOffscreenCanvas(
  w: number,
  h: number,
): OffscreenSurface | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Sheet id -> loaded image, or null if that sheet failed to load or hasn't resolved yet. */
export type SheetImages = Record<string, HTMLImageElement | null>;

/** Resolves to null on load failure — never throws — so a missing PNG can't break the game (RND-INV-1). */
function loadSpriteSheet(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Loads every sheet in the manifest; per-sheet failures resolve to null instead of rejecting the batch. */
export function loadSpriteSheets(
  defs: Record<string, { src: string }>,
): Promise<SheetImages> {
  const ids = Object.keys(defs);
  return Promise.all(ids.map((id) => loadSpriteSheet(defs[id].src))).then(
    (images) => {
      const sheets: SheetImages = {};
      ids.forEach((id, i) => {
        sheets[id] = images[i];
      });
      return sheets;
    },
  );
}

/**
 * Paints the letterbox border color across the whole display canvas. Only
 * `dx`/`dy`'s margins stay visible once `blitFrame` draws over the rest, so
 * this only needs to run when `fit` changes (on resize), not every frame.
 */
export function paintLetterbox(
  displayCtx: CanvasRenderingContext2D,
  fit: DisplayFit,
  borderColor: string,
): void {
  displayCtx.fillStyle = borderColor;
  displayCtx.fillRect(0, 0, fit.backingW, fit.backingH);
}

/** Blits the offscreen buffer onto the display canvas, integer-scaled and centered (RND-02). */
export function blitFrame(
  displayCtx: CanvasRenderingContext2D,
  offscreen: HTMLCanvasElement,
  fit: DisplayFit,
): void {
  displayCtx.drawImage(
    offscreen,
    0,
    0,
    offscreen.width,
    offscreen.height,
    fit.dx,
    fit.dy,
    offscreen.width * fit.k,
    offscreen.height * fit.k,
  );
}

const randRange = ([min, max]: readonly [number, number]) =>
  min + Math.random() * (max - min);

export function createSpeedLine(
  view: View,
  y: number,
  lengthRange: readonly [number, number],
): SpeedLine {
  return {
    x: view.roadPad + Math.random() * (view.w - view.roadPad * 2),
    y,
    length: randRange(lengthRange),
  };
}

/** Advances speed lines and respawns any that scrolled past the bottom. */
export function advanceSpeedLines(
  lines: SpeedLine[],
  view: View,
  pxDelta: number,
  lengthRange: readonly [number, number],
): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.y += pxDelta;
    if (line.y - line.length > view.h) {
      lines[i] = createSpeedLine(
        view,
        -Math.random() * view.h * 0.3,
        lengthRange,
      );
    }
  }
}

export function updateParticles(
  list: Particle[],
  dt: number,
  gravity = 0,
): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += gravity * dt;
  }
}

export interface DustConfig {
  driftX: number;
  fallSpeed: readonly [number, number];
  life: readonly [number, number];
  size: readonly [number, number];
}

export function emitDust(
  list: Particle[],
  maxCount: number,
  player: Box,
  config: DustConfig,
  colors: readonly string[],
): void {
  if (list.length >= maxCount) {
    list.shift();
  }
  list.push({
    x: player.x + player.width / 2 + (Math.random() - 0.5) * player.width * 0.6,
    y: player.y + player.height,
    vx: (Math.random() - 0.5) * config.driftX,
    vy: randRange(config.fallSpeed),
    life: randRange(config.life),
    maxLife: config.life[1],
    size: randRange(config.size),
    color: colors[Math.floor(Math.random() * colors.length)],
  });
}

export interface SparkConfig {
  count: number;
  speed: readonly [number, number];
  lift: number;
  life: readonly [number, number];
  size: readonly [number, number];
  gravity: number;
}

export function emitSparks(
  list: Particle[],
  player: Box,
  config: SparkConfig,
  color: string,
): void {
  const cx = player.x + player.width / 2;
  const cy = player.y + player.height / 2;
  for (let i = 0; i < config.count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(config.speed);
    const maxLife = randRange(config.life);
    list.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - config.lift,
      life: maxLife,
      maxLife,
      size: randRange(config.size),
      color,
    });
  }
}

const ROAD_TILE = 16;
const roadPatternCache = new Map<string, CanvasPattern | null>();
// Reused across frames so drawRoad's per-frame scroll doesn't allocate a DOMMatrix every call.
const roadPatternTransform = new DOMMatrix();

/**
 * Builds (and caches, same Map-cache idiom as `withAlpha`) a repeating
 * 16x32 tile of the brick-offset mortar grid, so the road paints with one
 * pattern fill per frame instead of redrawing every grid line. Two tile
 * rows are needed to capture the alternating brick offset.
 */
function getRoadPattern(
  c: CanvasRenderingContext2D,
  colors: RenderColors,
): CanvasPattern | null {
  const key = `${colors.cobbleMid}|${colors.ink}`;
  return cachedBy(roadPatternCache, key, () => {
    const surface = createOffscreenCanvas(ROAD_TILE, ROAD_TILE * 2);
    if (!surface) {
      return null;
    }
    const tc = surface.ctx;
    tc.fillStyle = colors.cobbleMid;
    tc.fillRect(0, 0, ROAD_TILE, ROAD_TILE * 2);
    tc.strokeStyle = withAlpha(colors.ink, 0.25);
    tc.lineWidth = 1;
    for (let row = 0; row < 2; row++) {
      const y = row * ROAD_TILE;
      tc.beginPath();
      tc.moveTo(0, y + 0.5);
      tc.lineTo(ROAD_TILE, y + 0.5);
      tc.stroke();
      const xShift = row % 2 === 0 ? 0 : ROAD_TILE / 2;
      for (let x = xShift; x <= ROAD_TILE; x += ROAD_TILE) {
        tc.beginPath();
        tc.moveTo(x + 0.5, y);
        tc.lineTo(x + 0.5, y + ROAD_TILE);
        tc.stroke();
      }
    }
    return c.createPattern(surface.canvas, "repeat");
  });
}

/** Wraps `value` into `[0, period)` — a defensive double-modulo since a negative `value` (JS's `%` keeps the dividend's sign) must still land in range. */
function wrapOffset(value: number, period: number): number {
  return ((value % period) + period) % period;
}

const tilePatternCache = new Map<string, CanvasPattern | null>();
// Reused across the road/curb tile draws each frame, same idiom as roadPatternTransform.
const tilePatternTransform = new DOMMatrix();

/** Crops a `town.png` region into a repeatable CanvasPattern, cached by `regionKey` (RND-09) — the only tile sheet is `town`, so its id isn't threaded through as a param. */
function getTilePattern(
  c: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  regionKey: string,
  region: FrameRect,
): CanvasPattern | null {
  return cachedBy(
    tilePatternCache,
    `${TILE_SHEETS.town.id}|${regionKey}`,
    () => {
      const surface = createOffscreenCanvas(region.w, region.h);
      if (!surface) {
        return null;
      }
      surface.ctx.drawImage(
        sheet,
        region.x,
        region.y,
        region.w,
        region.h,
        0,
        0,
        region.w,
        region.h,
      );
      return c.createPattern(surface.canvas, "repeat");
    },
  );
}

/** Fills `x, 0, w, view.h` with `regionKey`'s tile pattern, scrolled by `offset`, at `alpha`. Returns false if the pattern isn't buildable (RND-INV-1 fallback). */
function fillTileRegion(
  c: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  regionKey: string,
  offset: number,
  x: number,
  w: number,
  view: View,
  alpha: number,
): boolean {
  const region = TILE_SHEETS.town.regions[regionKey];
  if (!region) {
    return false;
  }
  const pattern = getTilePattern(c, sheet, regionKey, region);
  if (!pattern) {
    return false;
  }
  tilePatternTransform.f = offset;
  pattern.setTransform(tilePatternTransform);
  c.globalAlpha = alpha;
  c.fillStyle = pattern;
  c.fillRect(x, 0, w, view.h);
  c.globalAlpha = 1;
  return true;
}

/**
 * Fills `x, 0, w, view.h` with `regionPrefix`'s zone tile(s) (RND-09): the
 * previous zone's tile opaque first, then the current zone's tile on top at
 * `alpha = zoneBlend.t`, so mid-crossfade frames blend the two — steady state
 * (`t >= 1`) skips the first pass and paints only the current zone. Shared by
 * `drawRoad` and `drawCurbs`'s per-strip calls. Returns whether every pass
 * that ran built its pattern successfully (RND-INV-1 fallback trigger).
 */
function paintZoneBlendedRegion(
  c: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  regionPrefix: string,
  zoneBlend: ZoneBlend,
  offset: number,
  x: number,
  w: number,
  view: View,
): boolean {
  const fromOk =
    zoneBlend.t >= 1 ||
    fillTileRegion(
      c,
      sheet,
      `${regionPrefix}-${zoneBlend.fromZoneId}`,
      offset,
      x,
      w,
      view,
      1,
    );
  const toOk = fillTileRegion(
    c,
    sheet,
    `${regionPrefix}-${zoneBlend.toZoneId}`,
    offset,
    x,
    w,
    view,
    zoneBlend.t,
  );
  return fromOk && toOk;
}

/** Flat road fill plus a scrolling 16px mortar grid (WLD-03 tile grid; no gradients), or the `town.png` per-zone road tile when loaded (RND-09). */
export function drawRoad(
  c: CanvasRenderingContext2D,
  view: View,
  bgOffset: number,
  colors: RenderColors,
  townSheet: HTMLImageElement | null,
  zoneBlend: ZoneBlend,
): void {
  const x = view.roadPad;
  const w = view.w - view.roadPad * 2;
  if (townSheet) {
    const period = TILE_SHEETS.town.regions[`road-${zoneBlend.toZoneId}`]?.h;
    if (
      period &&
      paintZoneBlendedRegion(
        c,
        townSheet,
        "road",
        zoneBlend,
        wrapOffset(bgOffset, period),
        x,
        w,
        view,
      )
    ) {
      return;
    }
  }
  const pattern = getRoadPattern(c, colors);
  if (pattern) {
    roadPatternTransform.f = wrapOffset(bgOffset, ROAD_TILE * 2);
    pattern.setTransform(roadPatternTransform);
    c.fillStyle = pattern;
  } else {
    c.fillStyle = colors.cobbleMid;
  }
  c.fillRect(x, 0, w, view.h);
}

export function drawCurbs(
  c: CanvasRenderingContext2D,
  view: View,
  bgOffset: number,
  colors: RenderColors,
  townSheet: HTMLImageElement | null,
  zoneBlend: ZoneBlend,
): void {
  if (townSheet) {
    const period = TILE_SHEETS.town.regions[`curb-${zoneBlend.toZoneId}`]?.h;
    if (period) {
      const offset = wrapOffset(bgOffset, period);
      const leftOk = paintZoneBlendedRegion(
        c,
        townSheet,
        "curb",
        zoneBlend,
        offset,
        0,
        view.roadPad,
        view,
      );
      const rightOk = paintZoneBlendedRegion(
        c,
        townSheet,
        "curb",
        zoneBlend,
        offset,
        view.w - view.roadPad,
        view.roadPad,
        view,
      );
      if (leftOk && rightOk) {
        return;
      }
    }
  }
  const stripe = 16;
  const curbW = Math.max(6, view.roadPad * 0.6);
  const offset = bgOffset % (stripe * 2);
  for (let pass = 0; pass < 2; pass++) {
    c.fillStyle = pass === 0 ? colors.cobbleLight : colors.leafGreen;
    const start = offset - stripe * 2 + pass * stripe;
    for (let y = start; y < view.h + stripe; y += stripe * 2) {
      c.fillRect(view.roadPad - curbW, y, curbW, stripe);
      c.fillRect(view.w - view.roadPad, y, curbW, stripe);
    }
  }
}

const LANE_DASH = [6, 8];

export function drawLaneLines(
  c: CanvasRenderingContext2D,
  view: View,
  laneCount: number,
  bgOffset: number,
  colors: RenderColors,
): void {
  c.strokeStyle = withAlpha(colors.cobbleLight, 0.6);
  c.lineWidth = 1;
  c.setLineDash(LANE_DASH);
  c.lineDashOffset = -bgOffset;
  for (let i = 1; i < laneCount; i++) {
    const x = view.roadPad + view.laneWidth * i;
    c.beginPath();
    c.moveTo(x, -4);
    c.lineTo(x, view.h + 4);
    c.stroke();
  }
  c.setLineDash([]);
}

export function drawSpeedLines(
  c: CanvasRenderingContext2D,
  lines: readonly SpeedLine[],
  colors: RenderColors,
): void {
  c.strokeStyle = withAlpha(colors.ink, 0.2);
  c.lineWidth = 1;
  c.beginPath();
  for (const line of lines) {
    c.moveTo(line.x, line.y - line.length);
    c.lineTo(line.x, line.y);
  }
  c.stroke();
}

const GOAL_CHECKER_CELL = 8;
const goalCheckerPatternCache = new Map<string, CanvasPattern | null>();
// Reused across frames so drawGoalLine's per-frame positioning doesn't allocate a DOMMatrix every call.
const goalCheckerTransform = new DOMMatrix();

/** Builds (and caches, same idiom as `getRoadPattern`/`withAlpha`) a 2x2-cell checker tile. */
function getGoalCheckerPattern(
  c: CanvasRenderingContext2D,
  colors: RenderColors,
): CanvasPattern | null {
  const key = `${colors.warmWhite}|${colors.ink}`;
  return cachedBy(goalCheckerPatternCache, key, () => {
    const size = GOAL_CHECKER_CELL * 2;
    const surface = createOffscreenCanvas(size, size);
    if (!surface) {
      return null;
    }
    const tc = surface.ctx;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        tc.fillStyle = (row + col) % 2 === 0 ? colors.warmWhite : colors.ink;
        tc.fillRect(
          col * GOAL_CHECKER_CELL,
          row * GOAL_CHECKER_CELL,
          GOAL_CHECKER_CELL,
          GOAL_CHECKER_CELL,
        );
      }
    }
    return c.createPattern(surface.canvas, "repeat");
  });
}

const CASTLE_GATE_TOWER_H = 28;

/** WLD-05: the goal line as a road-spanning castle gate — flanking stone towers with a torch-flame accent, a drawbridge-deck checkered threshold. Draws the `town.png` `castle-gate` region when loaded (RND-08/09); the drawbridge threshold line sits 32px below the region top, matching `y` below. */
export function drawCastleGate(
  c: CanvasRenderingContext2D,
  view: View,
  remainingPx: number,
  playerYRatio: number,
  colors: RenderColors,
  townSheet: HTMLImageElement | null,
): void {
  const y = view.h * playerYRatio - remainingPx;
  if (y < -CASTLE_GATE_TOWER_H - 16 || y > view.h + 16) {
    return;
  }
  const gateRegion = TILE_SHEETS.town.regions["castle-gate"];
  if (townSheet && gateRegion) {
    c.drawImage(
      townSheet,
      gateRegion.x,
      gateRegion.y,
      gateRegion.w,
      gateRegion.h,
      0,
      y - 32,
      gateRegion.w,
      gateRegion.h,
    );
    return;
  }
  const towerW = Math.max(10, view.roadPad * 1.4);
  const towerY = y - CASTLE_GATE_TOWER_H + GOAL_CHECKER_CELL;
  for (const towerX of [view.roadPad - towerW, view.w - view.roadPad]) {
    c.fillStyle = colors.duskPurple;
    c.fillRect(towerX, towerY, towerW, CASTLE_GATE_TOWER_H);
    strokeInset(c, towerX, towerY, towerW, CASTLE_GATE_TOWER_H, colors.ink);
    // Torch flame: a flat gold square with a warm-white ember core (no blur, RND-07 style).
    c.fillStyle = colors.gold;
    c.fillRect(towerX + towerW * 0.35, towerY + 4, 4, 4);
    c.fillStyle = colors.warmWhite;
    c.fillRect(towerX + towerW * 0.35 + 1, towerY + 5, 2, 2);
  }
  const pattern = getGoalCheckerPattern(c, colors);
  if (pattern) {
    goalCheckerTransform.e = view.roadPad;
    goalCheckerTransform.f = y;
    pattern.setTransform(goalCheckerTransform);
    c.fillStyle = pattern;
  } else {
    c.fillStyle = colors.warmWhite;
  }
  c.fillRect(view.roadPad, y, view.w - view.roadPad * 2, GOAL_CHECKER_CELL * 2);
}

/**
 * SPEC-CORE zone transitions: one landmark prop scrolls past at each zone
 * boundary, keyed to the same `ZONE_TABLE` distances the crossfade/banner
 * trigger on — `town-gate-arch` at old-town's exit, `market-banner` at
 * market-street's exit.
 */
export const ZONE_LANDMARKS: readonly {
  atDistance: number;
  kind: "town-gate-arch" | "market-banner";
}[] = [
  { atDistance: ZONE_TABLE[0].upTo, kind: "town-gate-arch" },
  { atDistance: ZONE_TABLE[1].upTo, kind: "market-banner" },
];

const LANDMARK_BAND_H = 20;

function drawTownGateArch(
  c: CanvasRenderingContext2D,
  view: View,
  y: number,
  colors: RenderColors,
): void {
  const pillarW = Math.max(8, view.roadPad * 1.1);
  for (const pillarX of [view.roadPad - pillarW, view.w - view.roadPad]) {
    c.fillStyle = colors.cobbleLight;
    c.fillRect(pillarX, y, pillarW, LANDMARK_BAND_H);
    strokeInset(c, pillarX, y, pillarW, LANDMARK_BAND_H, colors.ink);
  }
  // Header beam spanning the road, closing the arch.
  c.fillStyle = colors.woodBrown;
  c.fillRect(
    view.roadPad - pillarW,
    y,
    view.w - view.roadPad * 2 + pillarW * 2,
    6,
  );
  strokeInset(
    c,
    view.roadPad - pillarW,
    y,
    view.w - view.roadPad * 2 + pillarW * 2,
    6,
    colors.ink,
  );
}

function drawMarketBanner(
  c: CanvasRenderingContext2D,
  view: View,
  y: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.rustRed;
  c.fillRect(view.roadPad, y, view.w - view.roadPad * 2, 10);
  strokeInset(c, view.roadPad, y, view.w - view.roadPad * 2, 10, colors.ink);
  const pennantW = 10;
  c.fillStyle = colors.gold;
  for (
    let x = view.roadPad + 4;
    x < view.w - view.roadPad;
    x += pennantW * 1.6
  ) {
    c.beginPath();
    c.moveTo(x, y + 10);
    c.lineTo(x + pennantW / 2, y + 16);
    c.lineTo(x + pennantW, y + 10);
    c.closePath();
    c.fill();
  }
}

/** Dispatches to the landmark's drawer if its scroll position is currently onscreen; draws the matching `town.png` region (keyed identically to `kind`) when loaded (RND-08/09). */
export function drawZoneLandmark(
  c: CanvasRenderingContext2D,
  view: View,
  remainingPx: number,
  playerYRatio: number,
  kind: "town-gate-arch" | "market-banner",
  colors: RenderColors,
  townSheet: HTMLImageElement | null,
): void {
  const y = view.h * playerYRatio - remainingPx;
  if (y < -LANDMARK_BAND_H - 4 || y > view.h + 4) {
    return;
  }
  const region = TILE_SHEETS.town.regions[kind];
  if (townSheet && region) {
    c.drawImage(
      townSheet,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      y,
      region.w,
      region.h,
    );
    return;
  }
  if (kind === "town-gate-arch") {
    drawTownGateArch(c, view, y, colors);
  } else {
    drawMarketBanner(c, view, y, colors);
  }
}

/** Rounds a logical Box to integer pixel coordinates for crisp, un-antialiased canvas draws. */
function roundBox(box: Box): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.width),
    h: Math.round(box.height),
  };
}

/** Chunky pixel-shape drawers (RND-07): flat fills, 1px ink outline, no gradients or glow. */
export function drawFallback(
  c: CanvasRenderingContext2D,
  shape: FallbackShape,
  box: Box,
  colors: RenderColors,
  animTime = 0,
): void {
  const { x, y, w, h } = roundBox(box);
  if (shape === "crate") {
    drawCrateShape(c, x, y, w, h, colors);
  } else if (shape === "cart") {
    drawCartShape(c, x, y, w, h, colors);
  } else if (shape === "coin") {
    drawCoinShape(c, x, y, w, h, colors);
  } else if (shape === "gem") {
    drawGemShape(c, x, y, w, h, colors);
  } else if (shape === "cat") {
    drawCatShape(c, x, y, w, h, colors);
  } else if (shape === "chicken") {
    drawChickenShape(c, x, y, w, h, colors);
  } else if (shape === "barrel") {
    drawBarrelShape(c, x, y, w, h, colors);
  } else {
    drawRunnerShape(c, x, y, w, h, colors, animTime);
  }
}

function drawCrateShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.woodBrown;
  c.fillRect(x, y, w, h);
  strokeInset(c, x, y, w, h, colors.ink);
  c.fillStyle = withAlpha(colors.ink, 0.5);
  c.fillRect(x + 2, y + h * 0.33, w - 4, 1);
  c.fillRect(x + 2, y + h * 0.66, w - 4, 1);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.22, y + h * 0.4, 3, 3);
  c.fillRect(x + w * 0.66, y + h * 0.4, 3, 3);
}

function drawCartShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.woodBrown;
  c.fillRect(x, y, w, h * 0.75);
  strokeInset(c, x, y, w, h * 0.75, colors.ink);
  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.2);
  const wheel = h * 0.28;
  c.fillStyle = colors.ink;
  c.fillRect(x + w * 0.12, y + h * 0.68, wheel, wheel);
  c.fillRect(x + w * 0.88 - wheel, y + h * 0.68, wheel, wheel);
}

function drawCoinShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.gold;
  c.fillRect(x, y, w, h);
  strokeInset(c, x, y, w, h, colors.ink);
  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.3, y + h * 0.25, w * 0.25, h * 0.25);
}

function drawGemShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.duskTeal;
  c.beginPath();
  c.moveTo(x + w / 2, y);
  c.lineTo(x + w, y + h * 0.4);
  c.lineTo(x + w / 2, y + h);
  c.lineTo(x, y + h * 0.4);
  c.closePath();
  c.fill();
  c.strokeStyle = colors.ink;
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.4, y + h * 0.2, w * 0.2, h * 0.2);
}

/** Napping/hopping stray cat: low body, triangular ears, a curled tail. */
function drawCatShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.terracotta;
  c.fillRect(x + w * 0.1, y + h * 0.35, w * 0.8, h * 0.55);
  strokeInset(c, x + w * 0.1, y + h * 0.35, w * 0.8, h * 0.55, colors.ink);
  c.fillRect(x + w * 0.12, y, w * 0.18, h * 0.35);
  c.fillRect(x + w * 0.55, y, w * 0.18, h * 0.35);
  c.fillRect(x - w * 0.08, y + h * 0.35, w * 0.2, h * 0.18);
  c.fillStyle = colors.ink;
  c.fillRect(x + w * 0.68, y + h * 0.48, 2, 2);
}

/** One chicken-flock bird: round white body, gold comb, terracotta beak. */
function drawChickenShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.6);
  strokeInset(c, x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.6, colors.ink);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.35, y, w * 0.3, h * 0.3);
  c.fillStyle = colors.terracotta;
  c.fillRect(x + w * 0.68, y + h * 0.45, w * 0.22, h * 0.12);
}

/** Rolling ale barrel: wood-brown body with two gold hoop bands. */
function drawBarrelShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.woodBrown;
  c.fillRect(x + w * 0.1, y, w * 0.8, h);
  strokeInset(c, x + w * 0.1, y, w * 0.8, h, colors.ink);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.1, y + h * 0.25, w * 0.8, h * 0.08);
  c.fillRect(x + w * 0.1, y + h * 0.67, w * 0.8, h * 0.08);
}

function drawRunnerShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
  animTime: number,
): void {
  const legPhase = Math.round(Math.sin(animTime * 16) * h * 0.05);
  c.fillStyle = withAlpha(colors.ink, 0.25);
  c.fillRect(x + w * 0.15, y + h * 0.94, w * 0.7, 2);

  const footW = w * 0.22;
  c.fillStyle = colors.woodBrown;
  c.fillRect(x + w * 0.16, y + h * 0.86 + legPhase, footW, h * 0.12);
  c.fillRect(x + w * 0.62, y + h * 0.86 - legPhase, footW, h * 0.12);

  const torsoY = y + h * 0.42;
  const torsoH = h * 0.5;
  c.fillStyle = colors.parchment;
  c.fillRect(x + w * 0.14, torsoY, w * 0.72, torsoH);
  strokeInset(c, x + w * 0.14, torsoY, w * 0.72, torsoH, colors.ink);

  c.fillStyle = colors.rustRed;
  c.fillRect(x + w * 0.1, torsoY, w * 0.8, h * 0.12);

  const headY = y + h * 0.22;
  const headH = h * 0.2;
  c.fillStyle = colors.parchment;
  c.fillRect(x + w * 0.24, headY, w * 0.52, headH);
  c.fillStyle = colors.woodBrown;
  c.fillRect(x + w * 0.22, headY - 2, w * 0.56, 4);
  strokeInset(c, x + w * 0.24, headY, w * 0.52, headH, colors.ink);

  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.2, y, w * 0.6, h * 0.2);
  strokeInset(c, x + w * 0.2, y, w * 0.6, h * 0.2, colors.ink);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.44, y, w * 0.12, h * 0.2);
}

/** Resolves the sheet + current frame to draw, or null if the sheet/animation isn't available (RND-06 shared mechanism). */
function resolveSpriteFrame(
  sheetDef: SpriteSheetDef | undefined,
  sheet: HTMLImageElement | null | undefined,
  animationId: string,
  timeSec: number,
): { sheet: HTMLImageElement; frame: FrameRect } | null {
  const anim = sheetDef?.animations[animationId];
  return sheet && anim ? { sheet, frame: frameAt(anim, timeSec) } : null;
}

/** Draws the current sprite frame if `def.sprite` names a loaded sheet + animation, else the fallback shape (RND-06). */
export function drawEntity(
  c: CanvasRenderingContext2D,
  instance: EntityInstance,
  def: EntityDef,
  colors: RenderColors,
  sheets: SheetImages,
  timeSec: number,
): void {
  const resolved = def.sprite
    ? resolveSpriteFrame(
        SPRITE_SHEETS[def.sprite.sheet],
        sheets[def.sprite.sheet],
        def.sprite.animation,
        timeSec,
      )
    : null;
  if (resolved) {
    const { x, y, w, h } = roundBox(instance);
    c.drawImage(
      resolved.sheet,
      resolved.frame.x,
      resolved.frame.y,
      resolved.frame.w,
      resolved.frame.h,
      x,
      y,
      w,
      h,
    );
    return;
  }
  drawFallback(c, def.fallback, instance, colors);
}

export type PlayerAnimState = "idle" | "run" | "switch" | "crash" | "victory";

/**
 * Draws Poco from the sprite sheet when loaded, mirroring horizontally for
 * `facing === -1` (the sheet only draws the right-facing switch lean);
 * falls back to the parameterized runner shape otherwise (RND-INV-1).
 */
export function drawPlayer(
  c: CanvasRenderingContext2D,
  box: Box,
  colors: RenderColors,
  animState: PlayerAnimState,
  animTime: number,
  animStateTime: number,
  sheet: HTMLImageElement | null,
  facing: 1 | -1,
): void {
  const resolved = resolveSpriteFrame(
    SPRITE_SHEETS.poco,
    sheet,
    animState,
    animStateTime,
  );
  if (resolved) {
    const { x, y, w, h } = roundBox(box);
    if (facing === -1) {
      c.save();
      c.translate(x + w, y);
      c.scale(-1, 1);
      c.drawImage(
        resolved.sheet,
        resolved.frame.x,
        resolved.frame.y,
        resolved.frame.w,
        resolved.frame.h,
        0,
        0,
        w,
        h,
      );
      c.restore();
    } else {
      c.drawImage(
        resolved.sheet,
        resolved.frame.x,
        resolved.frame.y,
        resolved.frame.w,
        resolved.frame.h,
        x,
        y,
        w,
        h,
      );
    }
    return;
  }
  drawFallback(c, "runner", box, colors, animTime);
}

export function drawParticles(
  c: CanvasRenderingContext2D,
  list: readonly Particle[],
): void {
  for (const p of list) {
    c.globalAlpha = Math.max(0, p.life / p.maxLife);
    c.fillStyle = p.color;
    const s = p.size;
    c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  c.globalAlpha = 1;
}

/** "market-street" -> "MARKET STREET" (SPEC-CORE zone transitions banner retitle). */
function zoneDisplayName(zoneId: string): string {
  return zoneId.replace(/-/g, " ").toUpperCase();
}

export function drawBanner(
  c: CanvasRenderingContext2D,
  view: View,
  level: number,
  bannerTime: number,
  bannerDuration: number,
  colors: RenderColors,
  font: string,
): void {
  if (bannerTime <= 0) {
    return;
  }
  const zone = ZONE_TABLE.find((z) => z.level === level);
  const title = zone
    ? `ZONE ${level} — ${zoneDisplayName(zone.id)}`
    : `ZONE ${level}`;
  const t = bannerTime / bannerDuration;
  c.globalAlpha = Math.min(1, t * 2.5);
  c.textAlign = "center";
  const titleY = view.h * 0.3 - (1 - t) * 12;
  const subY = view.h * 0.3 + view.w * 0.055;
  c.font = `italic 900 ${Math.round(view.w * 0.05)}px ${font}`;
  c.fillStyle = colors.ink;
  c.fillText(title, view.w / 2 + 1, titleY + 1);
  c.fillStyle = colors.gold;
  c.fillText(title, view.w / 2, titleY);
  c.font = `700 ${Math.round(view.w * 0.045)}px ${font}`;
  c.fillStyle = colors.ink;
  c.fillText("SPEED UP!", view.w / 2 + 1, subY + 1);
  c.fillStyle = colors.gold;
  c.fillText("SPEED UP!", view.w / 2, subY);
  c.globalAlpha = 1;
  c.textAlign = "start";
}

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

/** Draws one full frame onto the fixed logical canvas, in pipeline order (road -> entities -> fx -> banner). */
export function renderFrame(
  c: CanvasRenderingContext2D,
  { view, sim, player, level, config, defs, sheets }: RenderFrameArgs,
): void {
  const remainingGoalPx =
    (config.targetDistance - sim.distance) * (view.h * config.speedRatio);
  c.save();
  if (sim.shakeTime > 0) {
    const k = (sim.shakeTime / config.shake.duration) * config.shake.magnitude;
    c.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
  }
  c.fillStyle = config.colors.duskPurple;
  c.fillRect(-4, -4, view.w + 8, view.h + 8);
  const townSheet = sheets.town ?? null;
  drawRoad(c, view, sim.bgOffset, config.colors, townSheet, config.zoneBlend);
  drawCurbs(c, view, sim.bgOffset, config.colors, townSheet, config.zoneBlend);
  drawLaneLines(c, view, config.laneCount, sim.bgOffset, config.colors);
  drawSpeedLines(c, sim.speedLines, config.colors);
  for (const landmark of ZONE_LANDMARKS) {
    const remainingLandmarkPx =
      (landmark.atDistance - sim.distance) * (view.h * config.speedRatio);
    drawZoneLandmark(
      c,
      view,
      remainingLandmarkPx,
      config.playerYRatio,
      landmark.kind,
      config.colors,
      townSheet,
    );
  }
  drawCastleGate(
    c,
    view,
    remainingGoalPx,
    config.playerYRatio,
    config.colors,
    townSheet,
  );
  for (const obs of sim.obstacles) {
    drawEntity(c, obs, defs[obs.defId], config.colors, sheets, sim.animTime);
  }
  for (const item of sim.items) {
    drawEntity(c, item, defs[item.defId], config.colors, sheets, sim.animTime);
  }
  drawParticles(c, sim.dust);
  drawParticles(c, sim.itemBurst);
  drawPlayer(
    c,
    player,
    config.colors,
    sim.playerAnimState,
    sim.animTime,
    sim.playerAnimStateTime,
    sheets.poco ?? null,
    sim.playerFacing,
  );
  drawParticles(c, sim.sparks);
  drawBanner(
    c,
    view,
    level,
    sim.bannerTime,
    config.bannerDuration,
    config.colors,
    config.font,
  );
  c.restore();
}
