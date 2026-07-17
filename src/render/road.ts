import type { FrameRect } from "../sprites";
import { TILE_SHEETS } from "../sprites";
import { createOffscreenCanvas } from "./display";
import { cachedBy, withAlpha, wrapOffset } from "./helpers";
import type { RenderColors, View, ZoneBlend } from "./types";

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

const tilePatternCache = new Map<string, CanvasPattern | null>();
// Reused across the road/curb tile draws each frame, same idiom as roadPatternTransform.
const tilePatternTransform = new DOMMatrix();

/** Crops a `town.png` region into a repeatable CanvasPattern, cached by `regionKey` — the only tile sheet is `town`, so its id isn't threaded through as a param. */
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
 * Fills `x, 0, w, view.h` with `regionPrefix`'s zone tile(s): the
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

/** Flat road fill plus a scrolling 16px mortar grid (no gradients), or the `town.png` per-zone road tile when loaded. */
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
