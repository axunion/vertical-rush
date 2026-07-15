import { afterEach, describe, expect, it, vi } from "vitest";
import {
  advanceSpeedLines,
  createSpeedLine,
  emitDust,
  emitSparks,
  updateParticles,
} from "./particles";
import type { Particle, View } from "./types";

const view: View = { w: 180, h: 320, roadPad: 12, laneWidth: 52 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("updateParticles", () => {
  it("decays life by dt and removes particles once life reaches zero", () => {
    const list: Particle[] = [
      {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0.1,
        maxLife: 0.1,
        size: 1,
        color: "#fff",
      },
    ];
    updateParticles(list, 0.2);
    expect(list).toHaveLength(0);
  });

  it("moves surviving particles by vx/vy * dt", () => {
    const list: Particle[] = [
      {
        x: 10,
        y: 10,
        vx: 5,
        vy: -5,
        life: 1,
        maxLife: 1,
        size: 1,
        color: "#fff",
      },
    ];
    updateParticles(list, 0.5);
    expect(list[0].x).toBe(12.5);
    expect(list[0].y).toBe(7.5);
  });

  it("applies gravity to vy over time", () => {
    const list: Particle[] = [
      { x: 0, y: 0, vx: 0, vy: 0, life: 2, maxLife: 2, size: 1, color: "#fff" },
    ];
    updateParticles(list, 1, 100);
    expect(list[0].vy).toBe(100);
  });
});

describe("createSpeedLine", () => {
  it("places x within the road bounds and length within lengthRange", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const line = createSpeedLine(view, 42, [15, 60]);
    expect(line.y).toBe(42);
    expect(line.x).toBeGreaterThanOrEqual(view.roadPad);
    expect(line.x).toBeLessThanOrEqual(view.w - view.roadPad);
    expect(line.length).toBeGreaterThanOrEqual(15);
    expect(line.length).toBeLessThanOrEqual(60);
  });
});

describe("advanceSpeedLines", () => {
  it("scrolls a line down by pxDelta", () => {
    const lines = [{ x: 20, y: 10, length: 20 }];
    advanceSpeedLines(lines, view, 5, [15, 60]);
    expect(lines[0].y).toBe(15);
  });

  it("respawns a line once it has fully scrolled past the bottom", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const lines = [{ x: 20, y: view.h + 30, length: 20 }];
    advanceSpeedLines(lines, view, 1, [15, 60]);
    // Respawned above the top of the view instead of continuing past the bottom.
    expect(lines[0].y).toBeLessThan(0);
  });
});

describe("emitDust", () => {
  it("caps the list at maxCount by dropping the oldest particle", () => {
    const list: Particle[] = [
      { x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, size: 1, color: "a" },
      { x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, size: 1, color: "b" },
    ];
    emitDust(
      list,
      2,
      { x: 0, y: 0, width: 10, height: 10 },
      { driftX: 10, fallSpeed: [1, 2], life: [1, 1], size: [1, 1] },
      ["#fff"],
    );
    expect(list).toHaveLength(2);
    expect(list[0].color).toBe("b");
  });
});

describe("emitSparks", () => {
  it("emits exactly config.count particles", () => {
    const list: Particle[] = [];
    emitSparks(
      list,
      { x: 0, y: 0, width: 10, height: 10 },
      {
        count: 5,
        speed: [1, 2],
        lift: 1,
        life: [1, 1],
        size: [1, 1],
        gravity: 0,
      },
      "#f2b63d",
    );
    expect(list).toHaveLength(5);
  });
});
