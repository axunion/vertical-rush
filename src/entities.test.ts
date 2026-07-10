import { describe, expect, it } from "vitest";
import {
  advanceObstacles,
  type Obstacle,
  positionObstacleRow,
  remapObstacles,
  spawnRow,
} from "./entities";

/** Returns queued values in order; throws if called more times than provided. */
const queuedRng = (values: number[]) => {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error("queuedRng exhausted");
    }
    return values[i++];
  };
};

describe("spawnRow", () => {
  it("clamps the safe lane at the lower bound", () => {
    // step = floor(0*3)-1 = -1 -> 0-1 clamps to 0; not blockAll; picks lane 1.
    const rng = queuedRng([0, 0.99, 0]);
    expect(spawnRow(3, 0, 0.45, rng)).toEqual({
      safeLane: 0,
      blockedLanes: [1],
    });
  });

  it("clamps the safe lane at the upper bound", () => {
    // step = floor(1*3)-1 = 2 -> 2+2 clamps to 2; not blockAll; picks lane 0.
    const rng = queuedRng([1, 0.99, 0]);
    expect(spawnRow(3, 2, 0.45, rng)).toEqual({
      safeLane: 2,
      blockedLanes: [0],
    });
  });

  it("blocks all non-safe lanes when the doubleChance roll succeeds", () => {
    // step = floor(0.5*3)-1 = 0 -> safeLane stays 1; roll 0.1 < 0.45 -> blockAll.
    const rng = queuedRng([0.5, 0.1]);
    expect(spawnRow(3, 1, 0.45, rng)).toEqual({
      safeLane: 1,
      blockedLanes: [0, 2],
    });
  });

  it("blocks a single lane when the doubleChance roll fails", () => {
    // step = floor(0.5*3)-1 = 0 -> safeLane stays 1; roll 0.9 >= 0.45 -> single pick.
    const rng = queuedRng([0.5, 0.9, 0.99]);
    expect(spawnRow(3, 1, 0.45, rng)).toEqual({
      safeLane: 1,
      blockedLanes: [2],
    });
  });

  it("never blocks the safe lane (ENT-INV-1), swept across many rng inputs", () => {
    const sample = [0, 0.1, 0.25, 0.4, 0.45, 0.5, 0.6, 0.75, 0.9, 0.999];
    let safeLane = 1;
    for (const a of sample) {
      for (const b of sample) {
        for (const c of sample) {
          const rng = queuedRng([a, b, c]);
          const result = spawnRow(3, safeLane, 0.45, rng);
          expect(result.blockedLanes).not.toContain(result.safeLane);
          safeLane = result.safeLane;
        }
      }
    }
  });
});

describe("advanceObstacles", () => {
  const player = { x: 40, y: 200, width: 40, height: 40 };

  it("scrolls obstacles downward and reports no collision when clear", () => {
    const obstacles: Obstacle[] = [
      { lane: 0, x: 0, y: 0, width: 40, height: 40 },
    ];
    const crashed = advanceObstacles(obstacles, 10, 640, player);
    expect(crashed).toBe(false);
    expect(obstacles[0].y).toBe(10);
  });

  it("drops obstacles that scrolled past the bottom of the view", () => {
    const obstacles: Obstacle[] = [
      { lane: 0, x: 0, y: 630, width: 40, height: 40 },
    ];
    const crashed = advanceObstacles(obstacles, 20, 640, player);
    expect(crashed).toBe(false);
    expect(obstacles).toHaveLength(0);
  });

  it("reports a collision when an obstacle overlaps the player", () => {
    const obstacles: Obstacle[] = [
      { lane: 0, x: 40, y: 190, width: 40, height: 40 },
    ];
    const crashed = advanceObstacles(obstacles, 0, 640, player);
    expect(crashed).toBe(true);
    expect(obstacles).toHaveLength(1);
  });
});

describe("positionObstacleRow", () => {
  const laneCenterX = (lane: number) => 30 + lane * 100;

  it("positions one obstacle per blocked lane, centered and above the view", () => {
    const [obs] = positionObstacleRow([2], 100, laneCenterX);
    const width = 100 * 0.74;
    const height = width * 0.62;
    expect(obs).toEqual({
      lane: 2,
      x: laneCenterX(2) - width / 2,
      y: -height,
      width,
      height,
    });
  });

  it("returns one entry per lane, in input order", () => {
    expect(
      positionObstacleRow([0, 2], 100, laneCenterX).map((o) => o.lane),
    ).toEqual([0, 2]);
  });
});

describe("remapObstacles", () => {
  it("recenters x on the new lane width and rescales y proportionally", () => {
    const laneCenterX = (lane: number) => 30 + lane * 100;
    const obstacles: Obstacle[] = [
      { lane: 1, x: 999, y: 320, width: 10, height: 10 },
    ];
    remapObstacles(obstacles, 100, laneCenterX, 640, 320);
    const width = 100 * 0.74;
    const height = width * 0.62;
    expect(obstacles[0]).toEqual({
      lane: 1,
      x: laneCenterX(1) - width / 2,
      y: 160,
      width,
      height,
    });
  });
});
