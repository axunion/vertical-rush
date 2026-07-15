import { describe, expect, it } from "vitest";
import { GAME_CONFIG, ZONE_PALETTES, ZONE_STEADY_COLORS } from "./config";
import { lerpHexColor } from "./render/helpers";
import { frameColors, frameZoneBlend } from "./zoneVisuals";

describe("frameZoneBlend", () => {
  it("returns the precomputed steady blend when zoneFadeTime is 0", () => {
    const blend = frameZoneBlend(30, 0, "old-town", 1.2);
    expect(blend).toEqual({
      fromZoneId: "old-town",
      toZoneId: "old-town",
      t: 1,
    });
  });

  it("builds a fresh in-progress blend during the crossfade window", () => {
    const blend = frameZoneBlend(60, 0.6, "old-town", 1.2);
    expect(blend.fromZoneId).toBe("old-town");
    expect(blend.toZoneId).toBe("market-street");
    expect(blend.t).toBeCloseTo(0.5);
  });

  it("reaches t=1 as zoneFadeTime approaches 0 within the window", () => {
    const blend = frameZoneBlend(60, 0.001, "old-town", 1.2);
    expect(blend.t).toBeCloseTo(1, 2);
  });
});

describe("frameColors", () => {
  it("returns the precomputed steady colors object at t>=1", () => {
    const colors = frameColors({
      fromZoneId: "old-town",
      toZoneId: "old-town",
      t: 1,
    });
    expect(colors).toBe(ZONE_STEADY_COLORS["old-town"]);
  });

  it("lerps only the three zone-palette keys mid-crossfade, leaving the rest of the base palette untouched", () => {
    const colors = frameColors({
      fromZoneId: "old-town",
      toZoneId: "market-street",
      t: 0.5,
    });
    expect(colors.cobbleMid).toBe(
      lerpHexColor(
        ZONE_PALETTES["old-town"].cobbleMid,
        ZONE_PALETTES["market-street"].cobbleMid,
        0.5,
      ),
    );
    expect(colors.cobbleLight).toBe(
      lerpHexColor(
        ZONE_PALETTES["old-town"].cobbleLight,
        ZONE_PALETTES["market-street"].cobbleLight,
        0.5,
      ),
    );
    expect(colors.duskPurple).toBe(
      lerpHexColor(
        ZONE_PALETTES["old-town"].duskPurple,
        ZONE_PALETTES["market-street"].duskPurple,
        0.5,
      ),
    );
    expect(colors.gold).toBe(GAME_CONFIG.colors.gold);
  });
});
