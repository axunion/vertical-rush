import {
  GAME_CONFIG,
  ZONE_PALETTES,
  ZONE_STEADY_BLEND,
  ZONE_STEADY_COLORS,
} from "./config";
import { zoneRangeAt } from "./gameLogic";
// Imports the node-safe submodules directly, not the "./render" barrel: the
// barrel re-exports DOM-only files with a module-level `new DOMMatrix()`,
// which throws under Vitest's node environment (see zoneVisuals.test.ts).
import { lerpHexColor } from "./render/helpers";
import type { RenderColors, ZoneBlend } from "./render/types";

/** SPEC-CORE zone transitions / SPEC-RENDER RND-09: the single source of the zone-crossfade state, shared by the palette crossfade (`frameColors`) and the `town.png` tile crossfade. Only builds a fresh object during the ~2s crossfade window; steady state returns the precomputed `ZONE_STEADY_BLEND` entry. */
export function frameZoneBlend(
  distance: number,
  zoneFadeTime: number,
  zoneFadeFrom: string,
  zoneCrossfadeDuration: number,
): ZoneBlend {
  const toZoneId = zoneRangeAt(distance).zone.id;
  if (zoneFadeTime <= 0) {
    return ZONE_STEADY_BLEND[toZoneId];
  }
  const t = 1 - zoneFadeTime / zoneCrossfadeDuration;
  return { fromZoneId: zoneFadeFrom, toZoneId, t };
}

/** The current zone's road/sky colors, derived from `frameZoneBlend`'s output. Only builds a fresh object during the crossfade window; steady state returns the precomputed `ZONE_STEADY_COLORS` entry. */
export function frameColors(zoneBlend: ZoneBlend): RenderColors {
  if (zoneBlend.t >= 1) {
    return ZONE_STEADY_COLORS[zoneBlend.toZoneId];
  }
  const from = ZONE_PALETTES[zoneBlend.fromZoneId];
  const to = ZONE_PALETTES[zoneBlend.toZoneId];
  return {
    ...GAME_CONFIG.colors,
    cobbleMid: lerpHexColor(from.cobbleMid, to.cobbleMid, zoneBlend.t),
    cobbleLight: lerpHexColor(from.cobbleLight, to.cobbleLight, zoneBlend.t),
    duskPurple: lerpHexColor(from.duskPurple, to.duskPurple, zoneBlend.t),
  };
}
