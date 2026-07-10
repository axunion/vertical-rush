import type { EntityDef, EntityInstance, FallbackShape } from "./entities";
import type { Box } from "./gameLogic";

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

const alphaCache = new Map<string, string>();

/** Memoized: called every frame with a fixed set of palette hex/alpha pairs. */
function withAlpha(hex: string, alpha: number): string {
  return cachedBy(alphaCache, `${hex}|${alpha}`, () => {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
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

/** Flat road fill plus a scrolling 16px mortar grid (WLD-03 tile grid; no gradients). */
export function drawRoad(
  c: CanvasRenderingContext2D,
  view: View,
  bgOffset: number,
  colors: RenderColors,
): void {
  const pattern = getRoadPattern(c, colors);
  if (pattern) {
    const period = ROAD_TILE * 2;
    const offset = ((bgOffset % period) + period) % period;
    roadPatternTransform.f = offset;
    pattern.setTransform(roadPatternTransform);
    c.fillStyle = pattern;
  } else {
    c.fillStyle = colors.cobbleMid;
  }
  c.fillRect(view.roadPad, 0, view.w - view.roadPad * 2, view.h);
}

export function drawCurbs(
  c: CanvasRenderingContext2D,
  view: View,
  bgOffset: number,
  colors: RenderColors,
): void {
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

export function drawGoalLine(
  c: CanvasRenderingContext2D,
  view: View,
  remainingPx: number,
  playerYRatio: number,
  colors: RenderColors,
): void {
  const y = view.h * playerYRatio - remainingPx;
  if (y < -16 || y > view.h + 16) {
    return;
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

/** Chunky pixel-shape drawers (RND-07): flat fills, 1px ink outline, no gradients or glow. */
export function drawFallback(
  c: CanvasRenderingContext2D,
  shape: FallbackShape,
  box: Box,
  colors: RenderColors,
  animTime = 0,
): void {
  const x = Math.round(box.x);
  const y = Math.round(box.y);
  const w = Math.round(box.width);
  const h = Math.round(box.height);
  if (shape === "crate") {
    drawCrateShape(c, x, y, w, h, colors);
  } else if (shape === "cart") {
    drawCartShape(c, x, y, w, h, colors);
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

export function drawEntity(
  c: CanvasRenderingContext2D,
  instance: EntityInstance,
  def: EntityDef,
  colors: RenderColors,
): void {
  // def.sprite is always null until P3's sheet manifest lands; fallback-only for now.
  drawFallback(c, def.fallback, instance, colors);
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
  const t = bannerTime / bannerDuration;
  c.globalAlpha = Math.min(1, t * 2.5);
  c.textAlign = "center";
  const titleY = view.h * 0.3 - (1 - t) * 12;
  const subY = view.h * 0.3 + view.w * 0.055;
  c.font = `italic 900 ${Math.round(view.w * 0.09)}px ${font}`;
  c.fillStyle = colors.ink;
  c.fillText(`LEVEL ${level}`, view.w / 2 + 1, titleY + 1);
  c.fillStyle = colors.gold;
  c.fillText(`LEVEL ${level}`, view.w / 2, titleY);
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
  dust: readonly Particle[];
  sparks: readonly Particle[];
  speedLines: readonly SpeedLine[];
  animTime: number;
  bannerTime: number;
  shakeTime: number;
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
}

export interface RenderFrameArgs {
  view: View;
  sim: FrameSim;
  player: Box;
  level: number;
  config: FrameConfig;
  /** Registry to resolve each obstacle's `EntityDef` by `defId` (injected, not imported, so this stays testable against any registry — entity data, owned by entities.ts, not a GAME_CONFIG tunable). */
  defs: Record<string, EntityDef>;
}

/** Draws one full frame onto the fixed logical canvas, in pipeline order (road -> entities -> fx -> banner). */
export function renderFrame(
  c: CanvasRenderingContext2D,
  { view, sim, player, level, config, defs }: RenderFrameArgs,
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
  drawRoad(c, view, sim.bgOffset, config.colors);
  drawCurbs(c, view, sim.bgOffset, config.colors);
  drawLaneLines(c, view, config.laneCount, sim.bgOffset, config.colors);
  drawSpeedLines(c, sim.speedLines, config.colors);
  drawGoalLine(c, view, remainingGoalPx, config.playerYRatio, config.colors);
  for (const obs of sim.obstacles) {
    drawEntity(c, obs, defs[obs.defId], config.colors);
  }
  drawParticles(c, sim.dust);
  drawFallback(c, "runner", player, config.colors, sim.animTime);
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
