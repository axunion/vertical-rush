import type { FallbackShape } from "../entities";
import type { Box } from "../gameLogic";
import { roundBox, strokeInset, withAlpha } from "./helpers";
import type { RenderColors } from "./types";

/** Chunky pixel-shape drawers: flat fills, 1px ink outline, no gradients or glow. */
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
  } else if (shape === "guard") {
    drawGuardShape(c, x, y, w, h, colors);
  } else if (shape === "fountain") {
    drawFountainShape(c, x, y, w, h, colors);
  } else if (shape === "banner") {
    drawBannerShape(c, x, y, w, h, colors);
  } else if (shape === "roll") {
    drawSweetRollShape(c, x, y, w, h, colors);
  } else if (shape === "hourglass") {
    drawHourglassShape(c, x, y, w, h, colors);
  } else if (shape === "magnet") {
    drawMagnetShape(c, x, y, w, h, colors);
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

/** Patrolling town-guard: chibi humanoid silhouette, distinct from Poco's runner shape (no rust-red). */
function drawGuardShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.woodBrown;
  c.fillRect(x + w * 0.2, y + h * 0.4, w * 0.6, h * 0.5);
  strokeInset(c, x + w * 0.2, y + h * 0.4, w * 0.6, h * 0.5, colors.ink);
  c.fillStyle = colors.parchment;
  c.fillRect(x + w * 0.28, y + h * 0.14, w * 0.44, h * 0.28);
  c.fillStyle = colors.duskPurple;
  c.fillRect(x + w * 0.22, y, w * 0.56, h * 0.16);
  c.fillStyle = colors.cobbleLight;
  c.fillRect(x + w * 0.85, y, w * 0.08, h * 0.9);
}

/** Round stone fountain: wide stone base with a raised water basin, tall enough to force early commitment. */
function drawFountainShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.cobbleLight;
  c.fillRect(x, y + h * 0.7, w, h * 0.3);
  strokeInset(c, x, y + h * 0.7, w, h * 0.3, colors.ink);
  c.fillStyle = colors.duskTeal;
  c.fillRect(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.4);
  strokeInset(c, x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.4, colors.ink);
  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.44, y, w * 0.12, h * 0.4);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.38, y + h * 0.08, w * 0.24, w * 0.06);
}

/** Festival banner segment: a wood-brown crossbar with hanging cloth, reskinning a blocked lane of the safe-lane row. */
function drawBannerShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.woodBrown;
  c.fillRect(x, y, w, h * 0.2);
  strokeInset(c, x, y, w, h * 0.2, colors.ink);
  c.fillStyle = colors.leafGreen;
  c.fillRect(x + w * 0.08, y + h * 0.2, w * 0.84, h * 0.6);
  strokeInset(c, x + w * 0.08, y + h * 0.2, w * 0.84, h * 0.6, colors.ink);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.4, y + h * 0.32, w * 0.2, h * 0.2);
}

/** Glowing pastry (sweet-roll, P11): a warm-white bun with a gold swirl and a sparkle glint. */
function drawSweetRollShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.warmWhite;
  c.fillRect(x + w * 0.1, y + h * 0.2, w * 0.8, h * 0.65);
  strokeInset(c, x + w * 0.1, y + h * 0.2, w * 0.8, h * 0.65, colors.ink);
  c.fillStyle = colors.gold;
  c.fillRect(x + w * 0.2, y + h * 0.35, w * 0.6, h * 0.12);
  c.fillRect(x + w * 0.3, y + h * 0.55, w * 0.4, h * 0.12);
  c.fillRect(x + w * 0.7, y, w * 0.25, h * 0.25);
}

/** Blue hourglass (P11): a duskTeal frame around a two-triangle glass with a gold sand pile. */
function drawHourglassShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  c.fillStyle = colors.duskTeal;
  c.fillRect(x, y, w, h * 0.12);
  c.fillRect(x, y + h * 0.88, w, h * 0.12);
  strokeInset(c, x, y, w, h * 0.12, colors.ink);
  strokeInset(c, x, y + h * 0.88, w, h * 0.12, colors.ink);
  c.fillStyle = colors.cobbleLight;
  c.beginPath();
  c.moveTo(x + w * 0.15, y + h * 0.12);
  c.lineTo(x + w * 0.85, y + h * 0.12);
  c.lineTo(x + w * 0.5, y + h * 0.5);
  c.closePath();
  c.moveTo(x + w * 0.5, y + h * 0.5);
  c.lineTo(x + w * 0.85, y + h * 0.88);
  c.lineTo(x + w * 0.15, y + h * 0.88);
  c.closePath();
  c.fill();
  c.strokeStyle = colors.ink;
  c.lineWidth = 1;
  c.stroke();
  c.fillStyle = colors.gold;
  c.beginPath();
  c.moveTo(x + w * 0.35, y + h * 0.7);
  c.lineTo(x + w * 0.65, y + h * 0.7);
  c.lineTo(x + w * 0.5, y + h * 0.88);
  c.closePath();
  c.fill();
}

/** Horseshoe magnet (P11): duskPurple U-body with gold tip caps (avoids the rust-red key-color tolerance box). */
function drawMagnetShape(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: RenderColors,
): void {
  const legW = w * 0.28;
  c.fillStyle = colors.duskPurple;
  c.fillRect(x, y, legW, h * 0.7);
  c.fillRect(x + w - legW, y, legW, h * 0.7);
  c.fillRect(x, y + h * 0.7, w, h * 0.3);
  strokeInset(c, x, y, legW, h * 0.7, colors.ink);
  strokeInset(c, x + w - legW, y, legW, h * 0.7, colors.ink);
  strokeInset(c, x, y + h * 0.7, w, h * 0.3, colors.ink);
  c.fillStyle = colors.gold;
  c.fillRect(x, y, legW, h * 0.22);
  c.fillRect(x + w - legW, y, legW, h * 0.22);
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
