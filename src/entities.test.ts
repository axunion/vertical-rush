import { describe, expect, it } from "vitest";
import {
  advanceItems,
  advanceObstacles,
  COIN_TRAIL,
  ENTITY_DEFS,
  type EntityInstance,
  ITEM_CHANCE,
  PLAYER_SIZE,
  positionCoinTrail,
  positionObstacleRow,
  rollsCoinTrail,
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
    const obstacles: EntityInstance[] = [
      { defId: "market-crate", lane: 0, x: 0, y: 0, width: 40, height: 40 },
    ];
    const crashed = advanceObstacles(obstacles, 10, 320, player);
    expect(crashed).toBe(false);
    expect(obstacles[0].y).toBe(10);
  });

  it("drops obstacles that scrolled past the bottom of the view", () => {
    const obstacles: EntityInstance[] = [
      { defId: "market-crate", lane: 0, x: 0, y: 310, width: 40, height: 40 },
    ];
    const crashed = advanceObstacles(obstacles, 20, 320, player);
    expect(crashed).toBe(false);
    expect(obstacles).toHaveLength(0);
  });

  it("reports a collision when an obstacle overlaps the player", () => {
    const obstacles: EntityInstance[] = [
      { defId: "market-crate", lane: 0, x: 40, y: 190, width: 40, height: 40 },
    ];
    const crashed = advanceObstacles(obstacles, 0, 320, player);
    expect(crashed).toBe(true);
    expect(obstacles).toHaveLength(1);
  });
});

describe("positionObstacleRow", () => {
  const laneCenterX = (lane: number) => 30 + lane * 100;

  it("places one market-crate per blocked lane when a single lane is blocked", () => {
    const [obs] = positionObstacleRow([2], laneCenterX);
    const { size } = ENTITY_DEFS["market-crate"];
    expect(obs).toEqual({
      defId: "market-crate",
      lane: 2,
      x: laneCenterX(2) - size.w / 2,
      y: -size.h,
      width: size.w,
      height: size.h,
    });
  });

  it("places one hay-cart centered across two adjacent blocked lanes", () => {
    const result = positionObstacleRow([0, 1], laneCenterX);
    const { size } = ENTITY_DEFS["hay-cart"];
    const centerX = (laneCenterX(0) + laneCenterX(1)) / 2;
    expect(result).toEqual([
      {
        defId: "hay-cart",
        lane: 0,
        x: centerX - size.w / 2,
        y: -size.h,
        width: size.w,
        height: size.h,
      },
    ]);
  });

  it("places two market-crates when the blocked lanes are not adjacent", () => {
    const result = positionObstacleRow([0, 2], laneCenterX);
    expect(result.map((o) => o.defId)).toEqual([
      "market-crate",
      "market-crate",
    ]);
    expect(result.map((o) => o.lane)).toEqual([0, 2]);
  });
});

describe("ENTITY_DEFS", () => {
  it("matches the ENT-02 source-of-truth footprint for market-crate and hay-cart", () => {
    expect(ENTITY_DEFS["market-crate"].size).toEqual({ w: 38, h: 24 });
    expect(ENTITY_DEFS["market-crate"].lanes).toBe(1);
    expect(ENTITY_DEFS["hay-cart"].size).toEqual({ w: 80, h: 32 });
    expect(ENTITY_DEFS["hay-cart"].lanes).toBe(2);
  });

  it("matches the ENT-02 source-of-truth footprint and collect effect for coin", () => {
    expect(ENTITY_DEFS.coin.size).toEqual({ w: 12, h: 12 });
    expect(ENTITY_DEFS.coin.lanes).toBe(1);
    expect(ENTITY_DEFS.coin.onCollision).toEqual({
      kind: "collect",
      score: 10,
      sfx: "coin",
    });
  });
});

describe("rollsCoinTrail", () => {
  it("rolls true when rng is below ITEM_CHANCE", () => {
    expect(rollsCoinTrail(() => 0)).toBe(true);
  });

  it("rolls false when rng is at or above ITEM_CHANCE", () => {
    expect(rollsCoinTrail(() => ITEM_CHANCE)).toBe(false);
  });
});

describe("positionCoinTrail", () => {
  const laneCenterX = (lane: number) => 30 + lane * 100;

  it("places COIN_TRAIL.count coins in the row's safe lane", () => {
    const trail = positionCoinTrail(1, laneCenterX, 35.2);
    expect(trail).toHaveLength(COIN_TRAIL.count);
    expect(trail.every((c) => c.lane === 1 && c.defId === "coin")).toBe(true);
    for (const coin of trail) {
      expect(coin.x).toBe(laneCenterX(1) - ENTITY_DEFS.coin.size.w / 2);
    }
  });

  it("spaces coins by COIN_TRAIL.spacingM meters, starting COIN_TRAIL.leadGapM behind the row", () => {
    const pxPerMeter = 10;
    const { size } = ENTITY_DEFS.coin;
    const trail = positionCoinTrail(0, laneCenterX, pxPerMeter);
    expect(trail[0].y).toBe(-COIN_TRAIL.leadGapM * pxPerMeter - size.h);
    expect(trail[1].y).toBe(
      -(COIN_TRAIL.leadGapM + COIN_TRAIL.spacingM) * pxPerMeter - size.h,
    );
    expect(trail[2].y).toBe(
      -(COIN_TRAIL.leadGapM + 2 * COIN_TRAIL.spacingM) * pxPerMeter - size.h,
    );
  });
});

describe("advanceItems", () => {
  const player = { x: 40, y: 200, width: 40, height: 40 };

  it("scrolls items downward and reports no collection when clear", () => {
    const items: EntityInstance[] = [
      { defId: "coin", lane: 0, x: 0, y: 0, width: 12, height: 12 },
    ];
    const collected = advanceItems(items, 10, 320, player);
    expect(collected).toEqual([]);
    expect(items[0].y).toBe(10);
  });

  it("drops items that scrolled past the bottom of the view", () => {
    const items: EntityInstance[] = [
      { defId: "coin", lane: 0, x: 0, y: 310, width: 12, height: 12 },
    ];
    const collected = advanceItems(items, 20, 320, player);
    expect(collected).toEqual([]);
    expect(items).toHaveLength(0);
  });

  it("collects an item overlapping the player and removes it (ENT-INV-3: never blocks)", () => {
    const items: EntityInstance[] = [
      { defId: "coin", lane: 0, x: 45, y: 205, width: 12, height: 12 },
    ];
    const collected = advanceItems(items, 0, 320, player);
    expect(collected).toEqual([{ score: 10, sfx: "coin" }]);
    expect(items).toHaveLength(0);
  });
});

describe("PLAYER_SIZE", () => {
  it("matches the RND-01 logical player sprite size", () => {
    expect(PLAYER_SIZE).toEqual({ w: 24, h: 32 });
  });
});
