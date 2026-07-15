import { ZONE_TABLE } from "../gameLogic";
import { TILE_SHEETS } from "../sprites";
import { createOffscreenCanvas } from "./display";
import { cachedBy, strokeInset } from "./helpers";
import type { RenderColors, View } from "./types";

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
