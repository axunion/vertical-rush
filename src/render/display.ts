import type { DisplayFit, OffscreenSurface } from "./types";

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
