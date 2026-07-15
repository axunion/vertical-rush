import { describe, expect, it } from "vitest";
import {
  cachedBy,
  hexToRgb,
  lerpHexColor,
  withAlpha,
  wrapOffset,
  zoneDisplayName,
} from "./helpers";

describe("hexToRgb", () => {
  it("parses a #RRGGBB hex string into channel values", () => {
    expect(hexToRgb("#D95763")).toEqual({ r: 217, g: 87, b: 99 });
  });
});

describe("withAlpha", () => {
  it("formats a hex color + alpha as rgba()", () => {
    expect(withAlpha("#D95763", 0.5)).toBe("rgba(217, 87, 99, 0.5)");
  });

  it("memoizes by hex|alpha so repeat calls return the same cached string", () => {
    const a = withAlpha("#33272E", 0.25);
    const b = withAlpha("#33272E", 0.25);
    expect(a).toBe(b);
  });
});

describe("lerpHexColor", () => {
  it("returns the start color at t=0", () => {
    expect(lerpHexColor("#000000", "#ffffff", 0)).toBe("#000000");
  });

  it("returns the end color at t=1", () => {
    expect(lerpHexColor("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("returns the midpoint at t=0.5", () => {
    expect(lerpHexColor("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("cachedBy", () => {
  it("computes once and returns the cached value on repeat calls", () => {
    const cache = new Map<string, number>();
    let calls = 0;
    const compute = () => {
      calls++;
      return 42;
    };
    expect(cachedBy(cache, "k", compute)).toBe(42);
    expect(cachedBy(cache, "k", compute)).toBe(42);
    expect(calls).toBe(1);
  });
});

describe("wrapOffset", () => {
  it("wraps a value already within [0, period) unchanged", () => {
    expect(wrapOffset(5, 16)).toBe(5);
  });

  it("wraps a negative value into range (JS % keeps the dividend's sign)", () => {
    expect(wrapOffset(-3, 16)).toBe(13);
  });

  it("wraps a value past the period back to the start", () => {
    expect(wrapOffset(18, 16)).toBe(2);
  });
});

describe("zoneDisplayName", () => {
  it("replaces dashes with spaces and upper-cases the result", () => {
    expect(zoneDisplayName("market-street")).toBe("MARKET STREET");
  });
});
