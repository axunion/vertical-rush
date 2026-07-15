import { describe, expect, it } from "vitest";
import {
  type AnimationDef,
  frameAt,
  SPRITE_SHEETS,
  TILE_SHEETS,
} from "./sprites";

const threeFrames: AnimationDef = {
  frames: [
    { x: 0, y: 0, w: 24, h: 32 },
    { x: 24, y: 0, w: 24, h: 32 },
    { x: 48, y: 0, w: 24, h: 32 },
  ],
  fps: 2,
  loop: true,
};

describe("frameAt", () => {
  it("picks frame 0 at time 0", () => {
    expect(frameAt(threeFrames, 0)).toEqual(threeFrames.frames[0]);
  });

  it("advances one frame per 1/fps seconds", () => {
    expect(frameAt(threeFrames, 0.4)).toEqual(threeFrames.frames[0]);
    expect(frameAt(threeFrames, 0.5)).toEqual(threeFrames.frames[1]);
    expect(frameAt(threeFrames, 1.0)).toEqual(threeFrames.frames[2]);
  });

  it("wraps around to frame 0 past the end when looping", () => {
    expect(frameAt(threeFrames, 1.5)).toEqual(threeFrames.frames[0]);
    expect(frameAt(threeFrames, 3.5)).toEqual(threeFrames.frames[1]);
  });

  it("clamps to the last frame past the end when not looping", () => {
    const clamped: AnimationDef = { ...threeFrames, loop: false };
    expect(frameAt(clamped, 1.5)).toEqual(clamped.frames[2]);
    expect(frameAt(clamped, 100)).toEqual(clamped.frames[2]);
  });

  it("never returns an out-of-range index for negative time", () => {
    expect(frameAt(threeFrames, -1)).toEqual(threeFrames.frames[0]);
  });
});

describe("SPRITE_SHEETS", () => {
  it("defines the poco sheet with all five animation states on the RND-04 grid", () => {
    const poco = SPRITE_SHEETS.poco;
    expect(poco.src).toBe("/assets/sheets/poco.png");
    expect(Object.keys(poco.animations).sort()).toEqual([
      "crash",
      "idle",
      "run",
      "switch",
      "victory",
    ]);
    expect(poco.animations.idle.frames).toHaveLength(2);
    expect(poco.animations.run.frames).toHaveLength(4);
    expect(poco.animations.switch.frames).toHaveLength(2);
    expect(poco.animations.crash.frames).toHaveLength(3);
    expect(poco.animations.victory.frames).toHaveLength(2);
    for (const anim of Object.values(poco.animations)) {
      for (const frame of anim.frames) {
        expect(frame.w).toBe(24);
        expect(frame.h).toBe(32);
      }
    }
  });

  it("defines the entities sheet with one band per entity on the RND-08 grid", () => {
    const SHEET_W = 80;
    const SHEET_H = 232;
    const entities = SPRITE_SHEETS.entities;
    expect(entities.src).toBe("/assets/sheets/entities.png");
    expect(Object.keys(entities.animations).sort()).toEqual(
      [
        "banner-arch",
        "chicken-flock",
        "coin",
        "fountain",
        "gem",
        "hay-cart",
        "market-crate",
        "rolling-barrel",
        "stray-cat",
        "town-guard",
      ].sort(),
    );

    const bands = Object.entries(entities.animations).map(([id, anim]) => {
      const [first] = anim.frames;
      return { id, y: first.y, h: first.h };
    });

    for (const anim of Object.values(entities.animations)) {
      for (const frame of anim.frames) {
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.w).toBeLessThanOrEqual(SHEET_W);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.y + frame.h).toBeLessThanOrEqual(SHEET_H);
      }
    }

    for (let i = 0; i < bands.length; i++) {
      for (let j = i + 1; j < bands.length; j++) {
        const a = bands[i];
        const b = bands[j];
        const overlaps = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe("TILE_SHEETS", () => {
  it("defines the town sheet with all nine RND-08 regions within the 192x128 sheet", () => {
    const SHEET_W = 192;
    const SHEET_H = 128;
    const town = TILE_SHEETS.town;
    expect(town.src).toBe("/assets/sheets/town.png");
    expect(Object.keys(town.regions).sort()).toEqual(
      [
        "castle-gate",
        "curb-castle-road",
        "curb-market-street",
        "curb-old-town",
        "market-banner",
        "road-castle-road",
        "road-market-street",
        "road-old-town",
        "town-gate-arch",
      ].sort(),
    );
    for (const region of Object.values(town.regions)) {
      expect(region.x).toBeGreaterThanOrEqual(0);
      expect(region.x + region.w).toBeLessThanOrEqual(SHEET_W);
      expect(region.y).toBeGreaterThanOrEqual(0);
      expect(region.y + region.h).toBeLessThanOrEqual(SHEET_H);
    }
  });

  it("keeps town regions non-overlapping", () => {
    const regions = Object.values(TILE_SHEETS.town.regions);
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i];
        const b = regions[j];
        const overlaps =
          a.x < b.x + b.w &&
          b.x < a.x + a.w &&
          a.y < b.y + b.h &&
          b.y < a.y + a.h;
        expect(overlaps).toBe(false);
      }
    }
  });
});
