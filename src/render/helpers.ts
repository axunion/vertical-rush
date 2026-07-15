import type { Box } from "../gameLogic";

/**
 * Shared Map-cache idiom: return the cached value for `key`, else `compute`
 * it and store it. A `null` result (a canvas/pattern build failure) is never
 * cached, so a transient failure gets retried next call instead of sticking.
 */
export function cachedBy<V>(
  cache: Map<string, V>,
  key: string,
  compute: () => V,
): V {
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const value = compute();
  cache.set(key, value);
  return value;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

const alphaCache = new Map<string, string>();

/** Memoized: called every frame with a fixed set of palette hex/alpha pairs. */
export function withAlpha(hex: string, alpha: number): string {
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
export function strokeInset(
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

/** Rounds a logical Box to integer pixel coordinates for crisp, un-antialiased canvas draws. */
export function roundBox(box: Box): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.width),
    h: Math.round(box.height),
  };
}

/** Wraps `value` into `[0, period)` — a defensive double-modulo since a negative `value` (JS's `%` keeps the dividend's sign) must still land in range. */
export function wrapOffset(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** "market-street" -> "MARKET STREET" (SPEC-CORE zone transitions banner retitle). */
export function zoneDisplayName(zoneId: string): string {
  return zoneId.replace(/-/g, " ").toUpperCase();
}
