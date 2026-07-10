import type { Box } from "./gameLogic";

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

export interface GlowSprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  pad: number;
}

export interface RenderColors {
  roadTop: string;
  roadBottom: string;
  laneLine: string;
  curb: string;
  curbAlt: string;
  player: string;
  playerTrim: string;
  playerFace: string;
  obstacle: string;
  obstacleStripe: string;
  spark: string;
  goal: string;
  speedLine: string;
  checker: readonly string[];
  highlight: string;
  shadow: string;
}

export const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Loads one image per named source; a per-image load failure resolves to null (RND-INV-1). */
export async function loadImages<K extends string>(
  sources: Record<K, string>,
): Promise<Record<K, HTMLImageElement | null>> {
  const keys = Object.keys(sources) as K[];
  const loaded = await Promise.all(keys.map((key) => loadImage(sources[key])));
  return Object.fromEntries(keys.map((key, i) => [key, loaded[i]])) as Record<
    K,
    HTMLImageElement | null
  >;
}

export function createRoadGradient(
  c: CanvasRenderingContext2D,
  height: number,
  top: string,
  bottom: string,
): CanvasGradient {
  const gradient = c.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  return gradient;
}

/** Fits the 9:16-style playfield inside the available box, rounded to whole px. */
export function computeView(
  maxW: number,
  maxH: number,
  aspect: number,
  roadPaddingRatio: number,
  laneCount: number,
): View {
  let w = maxW;
  let h = maxW / aspect;
  if (h > maxH) {
    h = maxH;
    w = maxH * aspect;
  }
  const roundedW = Math.round(w);
  const roundedH = Math.round(h);
  const roadPad = roundedW * roadPaddingRatio;
  return {
    w: roundedW,
    h: roundedH,
    roadPad,
    laneWidth: (roundedW - roadPad * 2) / laneCount,
  };
}

/** Backing-store size = CSS size x DPR; resizing a canvas resets its transform. */
export function applyCanvasSize(
  canvasEl: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  view: View,
): void {
  const dpr = window.devicePixelRatio || 1;
  canvasEl.style.width = `${view.w}px`;
  canvasEl.style.height = `${view.h}px`;
  canvasEl.width = Math.round(view.w * dpr);
  canvasEl.height = Math.round(view.h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Canvas shadowBlur is too slow to pay per frame on mobile, so the glowing
// player body is pre-rendered once per resize and stamped with drawImage.
export function renderGlowSprite(
  width: number,
  height: number,
  blur: number,
  color: string,
): GlowSprite | null {
  const pad = blur * 1.6;
  const w = width + pad * 2;
  const h = height + pad * 2;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  const c = canvas.getContext("2d");
  if (!c) {
    return null;
  }
  c.scale(dpr, dpr);
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(
    pad + width * 0.14,
    pad + height * 0.2,
    width * 0.72,
    height * 0.58,
    width * 0.3,
  );
  c.fill();
  return { canvas, w, h, pad };
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

export interface ViewportConfig {
  viewAspect: number;
  roadPaddingRatio: number;
  laneCount: number;
  playerGlowBlur: number;
  colors: Pick<RenderColors, "player" | "roadTop" | "roadBottom">;
  speedLines: { count: number; length: readonly [number, number] };
}

export interface Viewport {
  view: View;
  roadGradient: CanvasGradient;
  glowSprite: GlowSprite | null;
  speedLines: SpeedLine[];
}

/** Rebuilds everything geometry-derived after a resize: view, road gradient, glow sprite, speed lines. */
export function buildViewport(
  canvasEl: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  maxW: number,
  maxH: number,
  config: ViewportConfig,
  player: { widthRatio: number; aspect: number },
): Viewport {
  const view = computeView(
    maxW,
    maxH,
    config.viewAspect,
    config.roadPaddingRatio,
    config.laneCount,
  );
  applyCanvasSize(canvasEl, ctx, view);
  const roadGradient = createRoadGradient(
    ctx,
    view.h,
    config.colors.roadTop,
    config.colors.roadBottom,
  );
  const playerWidth = view.laneWidth * player.widthRatio;
  const glowSprite = renderGlowSprite(
    playerWidth,
    playerWidth * player.aspect,
    config.playerGlowBlur,
    config.colors.player,
  );
  const speedLines = Array.from({ length: config.speedLines.count }, () =>
    createSpeedLine(view, Math.random() * view.h, config.speedLines.length),
  );
  return { view, roadGradient, glowSprite, speedLines };
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

export function drawCurbs(
  c: CanvasRenderingContext2D,
  view: View,
  bgOffset: number,
  curbColor: string,
  curbAltColor: string,
): void {
  const stripe = 34;
  const curbW = Math.max(6, view.roadPad * 0.4);
  const offset = bgOffset % (stripe * 2);
  for (let pass = 0; pass < 2; pass++) {
    c.fillStyle = pass === 0 ? curbColor : curbAltColor;
    const start = offset - stripe * 2 + pass * stripe;
    for (let y = start; y < view.h + stripe; y += stripe * 2) {
      c.fillRect(view.roadPad - curbW, y, curbW, stripe);
      c.fillRect(view.w - view.roadPad, y, curbW, stripe);
    }
  }
}

export function drawLaneLines(
  c: CanvasRenderingContext2D,
  view: View,
  laneCount: number,
  bgOffset: number,
  laneLineColor: string,
): void {
  c.strokeStyle = laneLineColor;
  c.lineWidth = 3;
  c.setLineDash([16, 30]);
  c.lineDashOffset = -bgOffset;
  for (let i = 1; i < laneCount; i++) {
    const x = view.roadPad + view.laneWidth * i;
    c.beginPath();
    c.moveTo(x, -10);
    c.lineTo(x, view.h + 10);
    c.stroke();
  }
  c.setLineDash([]);
}

export function drawSpeedLines(
  c: CanvasRenderingContext2D,
  lines: readonly SpeedLine[],
  color: string,
): void {
  c.strokeStyle = color;
  c.lineWidth = 2;
  for (const line of lines) {
    c.beginPath();
    c.moveTo(line.x, line.y - line.length);
    c.lineTo(line.x, line.y);
    c.stroke();
  }
}

export function drawGoalLine(
  c: CanvasRenderingContext2D,
  view: View,
  remainingPx: number,
  playerYRatio: number,
  checkerA: string,
  checkerB: string,
): void {
  const y = view.h * playerYRatio - remainingPx;
  if (y < -40 || y > view.h + 40) {
    return;
  }
  const cell = 14;
  for (let row = 0; row < 2; row++) {
    for (let x = view.roadPad; x < view.w - view.roadPad; x += cell) {
      c.fillStyle =
        (Math.floor(x / cell) + row) % 2 === 0 ? checkerA : checkerB;
      c.fillRect(x, y + row * cell, cell, cell);
    }
  }
}

export function drawObstacles(
  c: CanvasRenderingContext2D,
  obstacles: readonly Box[],
  img: HTMLImageElement | null,
  colors: Pick<RenderColors, "obstacle" | "obstacleStripe" | "highlight">,
): void {
  for (const obs of obstacles) {
    if (img) {
      c.drawImage(img, obs.x, obs.y, obs.width, obs.height);
      continue;
    }
    c.fillStyle = colors.obstacle;
    c.beginPath();
    c.roundRect(obs.x, obs.y, obs.width, obs.height, 8);
    c.fill();
    c.save();
    c.clip();
    c.strokeStyle = colors.obstacleStripe;
    c.lineWidth = 8;
    for (let sx = -obs.height; sx < obs.width; sx += 22) {
      c.beginPath();
      c.moveTo(obs.x + sx, obs.y + obs.height + 4);
      c.lineTo(obs.x + sx + obs.height + 8, obs.y - 4);
      c.stroke();
    }
    c.restore();
    c.fillStyle = colors.highlight;
    c.fillRect(obs.x + 5, obs.y + 2, obs.width - 10, 3);
  }
}

export function drawPlayer(
  c: CanvasRenderingContext2D,
  p: Box,
  animTime: number,
  img: HTMLImageElement | null,
  glow: GlowSprite | null,
  colors: Pick<
    RenderColors,
    "shadow" | "playerTrim" | "player" | "playerFace" | "obstacleStripe"
  >,
): void {
  const cx = p.x + p.width / 2;
  c.fillStyle = colors.shadow;
  c.beginPath();
  c.ellipse(
    cx,
    p.y + p.height + 4,
    p.width * 0.45,
    p.width * 0.14,
    0,
    0,
    Math.PI * 2,
  );
  c.fill();
  if (img) {
    c.drawImage(img, p.x, p.y + Math.sin(animTime * 16) * 2, p.width, p.height);
    return;
  }
  const legPhase = Math.sin(animTime * 16) * p.height * 0.09;
  c.fillStyle = colors.playerTrim;
  c.beginPath();
  c.ellipse(
    cx - p.width * 0.22,
    p.y + p.height * 0.88 + legPhase,
    p.width * 0.13,
    p.height * 0.09,
    0,
    0,
    Math.PI * 2,
  );
  c.ellipse(
    cx + p.width * 0.22,
    p.y + p.height * 0.88 - legPhase,
    p.width * 0.13,
    p.height * 0.09,
    0,
    0,
    Math.PI * 2,
  );
  c.fill();
  if (glow) {
    c.drawImage(glow.canvas, p.x - glow.pad, p.y - glow.pad, glow.w, glow.h);
  } else {
    c.fillStyle = colors.player;
    c.beginPath();
    c.roundRect(
      p.x + p.width * 0.14,
      p.y + p.height * 0.2,
      p.width * 0.72,
      p.height * 0.58,
      p.width * 0.3,
    );
    c.fill();
  }
  c.fillStyle = colors.playerFace;
  c.beginPath();
  c.arc(cx, p.y + p.height * 0.16, p.width * 0.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = colors.obstacleStripe;
  c.fillRect(
    cx - p.width * 0.16,
    p.y + p.height * 0.1,
    p.width * 0.32,
    p.height * 0.06,
  );
}

export function drawParticles(
  c: CanvasRenderingContext2D,
  list: readonly Particle[],
): void {
  c.globalCompositeOperation = "lighter";
  for (const p of list) {
    c.globalAlpha = Math.max(0, p.life / p.maxLife);
    c.fillStyle = p.color;
    c.beginPath();
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
}

export function drawBanner(
  c: CanvasRenderingContext2D,
  view: View,
  level: number,
  bannerTime: number,
  bannerDuration: number,
  goalColor: string,
  font: string,
): void {
  if (bannerTime <= 0) {
    return;
  }
  const t = bannerTime / bannerDuration;
  c.globalAlpha = Math.min(1, t * 2.5);
  c.fillStyle = goalColor;
  c.shadowColor = goalColor;
  c.shadowBlur = 22;
  c.font = `italic 900 ${Math.round(view.w * 0.09)}px ${font}`;
  c.textAlign = "center";
  c.fillText(`LEVEL ${level}`, view.w / 2, view.h * 0.3 - (1 - t) * 24);
  c.font = `700 ${Math.round(view.w * 0.045)}px ${font}`;
  c.fillText("SPEED UP!", view.w / 2, view.h * 0.3 + view.w * 0.055);
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.textAlign = "start";
}

export interface FrameSim {
  bgOffset: number;
  distance: number;
  obstacles: readonly Box[];
  dust: readonly Particle[];
  sparks: readonly Particle[];
  speedLines: readonly SpeedLine[];
  animTime: number;
  bannerTime: number;
  shakeTime: number;
}

export interface FrameImages {
  player: HTMLImageElement | null;
  obstacle: HTMLImageElement | null;
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
  roadGradient: CanvasGradient | null;
  sim: FrameSim;
  images: FrameImages;
  glowSprite: GlowSprite | null;
  player: Box;
  level: number;
  config: FrameConfig;
}

/** Draws one full frame in the fixed pipeline order (background -> road -> entities -> fx -> banner). */
export function renderFrame(
  c: CanvasRenderingContext2D,
  {
    view,
    roadGradient,
    sim,
    images,
    glowSprite,
    player,
    level,
    config,
  }: RenderFrameArgs,
): void {
  const remainingGoalPx =
    (config.targetDistance - sim.distance) * (view.h * config.speedRatio);
  c.save();
  if (sim.shakeTime > 0) {
    const k = (sim.shakeTime / config.shake.duration) * config.shake.magnitude;
    c.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
  }
  c.fillStyle = roadGradient ?? config.colors.roadTop;
  c.fillRect(-20, -20, view.w + 40, view.h + 40);
  drawCurbs(c, view, sim.bgOffset, config.colors.curb, config.colors.curbAlt);
  drawLaneLines(
    c,
    view,
    config.laneCount,
    sim.bgOffset,
    config.colors.laneLine,
  );
  drawSpeedLines(c, sim.speedLines, config.colors.speedLine);
  drawGoalLine(
    c,
    view,
    remainingGoalPx,
    config.playerYRatio,
    config.colors.checker[0],
    config.colors.checker[1],
  );
  drawObstacles(c, sim.obstacles, images.obstacle, config.colors);
  drawParticles(c, sim.dust);
  drawPlayer(c, player, sim.animTime, images.player, glowSprite, config.colors);
  drawParticles(c, sim.sparks);
  drawBanner(
    c,
    view,
    level,
    sim.bannerTime,
    config.bannerDuration,
    config.colors.goal,
    config.font,
  );
  c.restore();
}
