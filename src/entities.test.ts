import { describe, expect, it } from "vitest";
import {
  advanceItems,
  advanceObstacles,
  CHICKEN_FLOCK,
  COIN_TRAIL,
  ENTITY_DEFS,
  type EntityInstance,
  PLAYER_SIZE,
  pickWeighted,
  positionCoinTrail,
  positionGem,
  positionObstacleRow,
  rollsCoinTrail,
  SPAWN_TABLE,
  shouldSpawnGem,
  spawnRow,
} from "./entities";
import { SPRITE_SHEETS } from "./sprites";

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

  it("scrolls a roller (rolling-barrel) at its speedFactor times the base scroll", () => {
    const obstacles: EntityInstance[] = [
      { defId: "rolling-barrel", lane: 0, x: 0, y: 0, width: 20, height: 20 },
    ];
    advanceObstacles(obstacles, 10, 320, player, 0.016);
    expect(obstacles[0].y).toBe(15); // speedFactor 1.5
  });

  it("leaves a dart (stray-cat) at its spawn x during the telegraph window", () => {
    const obstacles: EntityInstance[] = [
      {
        defId: "stray-cat",
        lane: 0,
        x: 30,
        y: 0,
        width: 16,
        height: 12,
        targetX: 82,
        moveSpeed: (82 - 30) / 0.3,
        moveDelay: 0.5,
      },
    ];
    advanceObstacles(obstacles, 0, 320, player, 0.2);
    expect(obstacles[0].x).toBe(30);
  });

  it("moves a dart (stray-cat) to targetX once the telegraph+hop window elapses", () => {
    const obstacles: EntityInstance[] = [
      {
        defId: "stray-cat",
        lane: 0,
        x: 30,
        y: 0,
        width: 16,
        height: 12,
        targetX: 82,
        moveSpeed: (82 - 30) / 0.3,
        moveDelay: 0.5,
      },
    ];
    advanceObstacles(obstacles, 0, 320, player, 0.5); // past telegraph
    advanceObstacles(obstacles, 0, 320, player, 0.3); // full hop duration
    expect(obstacles[0].x).toBe(82);
  });

  it("steps a walker (chicken-flock) toward targetX at crossSpeed and clamps on arrival", () => {
    const obstacles: EntityInstance[] = [
      {
        defId: "chicken-flock",
        lane: 0,
        x: 30,
        y: 0,
        width: 12,
        height: 12,
        targetX: 82,
        moveSpeed: 90,
        moveDelay: 0,
      },
    ];
    advanceObstacles(obstacles, 0, 320, player, 0.1);
    expect(obstacles[0].x).toBeCloseTo(39);
    advanceObstacles(obstacles, 0, 320, player, 10); // far past arrival
    expect(obstacles[0].x).toBe(82);
  });

  it("leaves static obstacles (no targetX) untouched by mover stepping", () => {
    const obstacles: EntityInstance[] = [
      { defId: "market-crate", lane: 0, x: 30, y: 0, width: 38, height: 24 },
    ];
    advanceObstacles(obstacles, 0, 320, player, 0.5);
    expect(obstacles[0].x).toBe(30);
  });
});

describe("pickWeighted", () => {
  const refs = [
    { defId: "a", weight: 1 },
    { defId: "b", weight: 3 },
  ];

  it("picks the first ref when the roll lands in its weight share", () => {
    expect(pickWeighted(refs, () => 0)).toBe("a");
  });

  it("picks a later ref when the roll lands past earlier weight shares", () => {
    expect(pickWeighted(refs, () => 0.99)).toBe("b");
  });

  it("falls back to the last ref for a roll at the very top of the range", () => {
    expect(pickWeighted(refs, () => 0.999999)).toBe("b");
  });
});

describe("SPAWN_TABLE", () => {
  it("has an entry for every zone with a coin item", () => {
    for (const zoneId of ["old-town", "market-street", "castle-road"]) {
      const zoneSpawn = SPAWN_TABLE[zoneId];
      expect(zoneSpawn.items).toEqual([{ defId: "coin", weight: 1 }]);
      expect(zoneSpawn.itemChance).toBeGreaterThan(0);
    }
  });

  it("adds stray-cat/chicken-flock to old-town and market-street only (ENT-02)", () => {
    for (const zoneId of ["old-town", "market-street"]) {
      const ids = new Set(SPAWN_TABLE[zoneId].obstacles.map((r) => r.defId));
      expect([...ids].sort()).toEqual([
        "chicken-flock",
        "hay-cart",
        "market-crate",
        "stray-cat",
      ]);
    }
    const castleIds = SPAWN_TABLE["castle-road"].obstacles.map((r) => r.defId);
    expect(castleIds).not.toContain("stray-cat");
    expect(castleIds).not.toContain("chicken-flock");
  });

  it("keeps market-crate's total old-town/market-street weight at 40, split across two refs bracketing the movers", () => {
    for (const zoneId of ["old-town", "market-street"]) {
      const marketCrateWeight = SPAWN_TABLE[zoneId].obstacles
        .filter((r) => r.defId === "market-crate")
        .reduce((sum, r) => sum + r.weight, 0);
      expect(marketCrateWeight).toBe(40);
    }
  });

  it("adds rolling-barrel to castle-road only (ENT-02)", () => {
    expect(
      SPAWN_TABLE["castle-road"].obstacles.map((r) => r.defId).sort(),
    ).toEqual(["hay-cart", "market-crate", "rolling-barrel"]);
    for (const zoneId of ["old-town", "market-street"]) {
      expect(SPAWN_TABLE[zoneId].obstacles.map((r) => r.defId)).not.toContain(
        "rolling-barrel",
      );
    }
  });

  it("still resolves a single-lane pick to market-crate at both rng extremes (guards the verify skill's deterministic rng=0/0.9 scenarios)", () => {
    const oneLaneRefs = SPAWN_TABLE["old-town"].obstacles.filter(
      (r) => r.defId !== "hay-cart",
    );
    expect(pickWeighted(oneLaneRefs, () => 0)).toBe("market-crate");
    expect(pickWeighted(oneLaneRefs, () => 0.9)).toBe("market-crate");
  });
});

describe("positionObstacleRow", () => {
  const laneCenterX = (lane: number) => 30 + lane * 100;
  const laneCount = 3;
  const pxPerMeter = 35.2;
  // rng = 0 always lands in the first ref's weight share, so market-crate/hay-cart
  // (the largest weights) are picked deterministically regardless of rng.
  const rng = () => 0;

  it("places one market-crate per blocked lane when a single lane is blocked", () => {
    const [obs] = positionObstacleRow(
      "old-town",
      [2],
      1,
      laneCount,
      laneCenterX,
      pxPerMeter,
      rng,
    );
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
    const result = positionObstacleRow(
      "old-town",
      [0, 1],
      2,
      laneCount,
      laneCenterX,
      pxPerMeter,
      rng,
    );
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
    const result = positionObstacleRow(
      "old-town",
      [0, 2],
      1,
      laneCount,
      laneCenterX,
      pxPerMeter,
      rng,
    );
    expect(result.map((o) => o.defId)).toEqual([
      "market-crate",
      "market-crate",
    ]);
    expect(result.map((o) => o.lane)).toEqual([0, 2]);
  });

  // oneLaneRefs (in order) = market-crate(20), stray-cat(15), chicken-flock(12),
  // market-crate(20); total 67. A roll of 0.4*67 = 26.8 lands past the first
  // market-crate's [0,20) share, inside stray-cat's [20,35) share.
  const strayCatRng = () => 0.4;

  it("gives stray-cat a hop target adjacent to its lane, avoiding the safe lane (ENT-INV-2)", () => {
    const [obs] = positionObstacleRow(
      "old-town",
      [0],
      2, // safe lane
      laneCount,
      laneCenterX,
      pxPerMeter,
      strayCatRng,
    );
    expect(obs.defId).toBe("stray-cat");
    const { size } = ENTITY_DEFS["stray-cat"];
    const behavior = ENTITY_DEFS["stray-cat"].behavior;
    if (behavior.kind !== "dart") {
      throw new Error("expected stray-cat to use the dart behavior");
    }
    // lane 0's only inbounds neighbor is lane 1 (safe lane is 2), so it hops there.
    expect(obs.targetX).toBe(laneCenterX(1) - size.w / 2);
    expect(obs.targetX).not.toBe(laneCenterX(2) - size.w / 2);
    expect(obs.moveDelay).toBe(behavior.telegraphSec);
    if (obs.targetX === undefined) {
      throw new Error("expected stray-cat to have a hop targetX");
    }
    expect(obs.moveSpeed).toBeCloseTo(
      Math.abs(obs.targetX - obs.x) / behavior.hopSec,
    );
  });

  it("leaves stray-cat in place when both lane neighbors are unavailable", () => {
    // lane 1's neighbors are 0 and 2; safe lane 0 rules one out, and here the
    // other (2) is also excluded by being out of a 2-lane road (laneCount 2).
    const [obs] = positionObstacleRow(
      "old-town",
      [1],
      0,
      2,
      laneCenterX,
      pxPerMeter,
      strayCatRng,
    );
    expect(obs.defId).toBe("stray-cat");
    expect(obs.targetX).toBeUndefined();
    expect(obs.moveSpeed).toBeUndefined();
  });

  // A roll of 0.6*67 = 40.2 lands inside chicken-flock's [35,47) share.
  const chickenRng = () => 0.6;

  it("spawns CHICKEN_FLOCK.count staggered chicken-flock birds sharing one drift target", () => {
    const result = positionObstacleRow(
      "old-town",
      [0],
      2, // safe lane
      laneCount,
      laneCenterX,
      pxPerMeter,
      chickenRng,
    );
    expect(result).toHaveLength(CHICKEN_FLOCK.count);
    const { size } = ENTITY_DEFS["chicken-flock"];
    const behavior = ENTITY_DEFS["chicken-flock"].behavior;
    if (behavior.kind !== "walker") {
      throw new Error("expected chicken-flock to use the walker behavior");
    }
    const expectedTargetX = laneCenterX(1) - size.w / 2;
    for (const [i, bird] of result.entries()) {
      expect(bird.defId).toBe("chicken-flock");
      expect(bird.lane).toBe(0);
      expect(bird.x).toBe(laneCenterX(0) - size.w / 2);
      expect(bird.targetX).toBe(expectedTargetX);
      expect(bird.targetX).not.toBe(laneCenterX(2) - size.w / 2);
      expect(bird.moveSpeed).toBe(behavior.crossSpeed);
      expect(bird.y).toBe(-i * CHICKEN_FLOCK.spacingM * pxPerMeter - size.h);
    }
  });

  it("ENT-INV-2: never rests a stray-cat or a chicken-flock bird in the row's safe lane, swept across every lane/safeLane pair", () => {
    for (let lane = 0; lane < laneCount; lane++) {
      for (let safeLane = 0; safeLane < laneCount; safeLane++) {
        if (safeLane === lane) {
          continue; // blockedLanes never include the safe lane (ENT-INV-1)
        }
        const [cat] = positionObstacleRow(
          "old-town",
          [lane],
          safeLane,
          laneCount,
          laneCenterX,
          pxPerMeter,
          strayCatRng,
        );
        const restingCatX = cat.targetX ?? cat.x;
        expect(restingCatX).not.toBe(laneCenterX(safeLane) - cat.width / 2);

        const [bird] = positionObstacleRow(
          "old-town",
          [lane],
          safeLane,
          laneCount,
          laneCenterX,
          pxPerMeter,
          chickenRng,
        );
        const restingBirdX = bird.targetX ?? bird.x;
        expect(restingBirdX).not.toBe(laneCenterX(safeLane) - bird.width / 2);
      }
    }
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

  it("matches the ENT-02 source-of-truth footprint and collect effect for gem", () => {
    expect(ENTITY_DEFS.gem.size).toEqual({ w: 12, h: 12 });
    expect(ENTITY_DEFS.gem.lanes).toBe(1);
    expect(ENTITY_DEFS.gem.onCollision).toEqual({
      kind: "collect",
      score: 50,
      sfx: "coin",
    });
  });

  it("matches the ENT-02 source-of-truth footprint and dart behavior for stray-cat", () => {
    expect(ENTITY_DEFS["stray-cat"].size).toEqual({ w: 16, h: 12 });
    expect(ENTITY_DEFS["stray-cat"].lanes).toBe(1);
    expect(ENTITY_DEFS["stray-cat"].behavior).toEqual({
      kind: "dart",
      telegraphSec: 0.5,
      hopSec: 0.3,
    });
    expect(ENTITY_DEFS["stray-cat"].onCollision).toEqual({ kind: "crash" });
  });

  it("matches the ENT-02 source-of-truth footprint and walker behavior for chicken-flock", () => {
    expect(ENTITY_DEFS["chicken-flock"].size).toEqual({ w: 12, h: 12 });
    expect(ENTITY_DEFS["chicken-flock"].lanes).toBe(1);
    expect(ENTITY_DEFS["chicken-flock"].behavior).toEqual({
      kind: "walker",
      crossSpeed: 90,
    });
    expect(ENTITY_DEFS["chicken-flock"].onCollision).toEqual({
      kind: "crash",
    });
  });

  it("matches the ENT-02 source-of-truth footprint and roller behavior for rolling-barrel", () => {
    expect(ENTITY_DEFS["rolling-barrel"].size).toEqual({ w: 20, h: 20 });
    expect(ENTITY_DEFS["rolling-barrel"].lanes).toBe(1);
    expect(ENTITY_DEFS["rolling-barrel"].behavior).toEqual({
      kind: "roller",
      speedFactor: 1.5,
    });
    expect(ENTITY_DEFS["rolling-barrel"].onCollision).toEqual({
      kind: "crash",
    });
  });
});

describe("rollsCoinTrail", () => {
  it("rolls true when rng is below the given itemChance", () => {
    expect(rollsCoinTrail(0.6, () => 0)).toBe(true);
  });

  it("rolls false when rng is at or above the given itemChance", () => {
    expect(rollsCoinTrail(0.6, () => 0.6)).toBe(false);
  });
});

describe("positionGem", () => {
  const laneCenterX = (lane: number) => 30 + lane * 100;

  it("places a single gem in the given lane at the row's leading edge", () => {
    const gem = positionGem(1, laneCenterX);
    const { size } = ENTITY_DEFS.gem;
    expect(gem).toEqual({
      defId: "gem",
      lane: 1,
      x: laneCenterX(1) - size.w / 2,
      y: -size.h,
      width: size.w,
      height: size.h,
    });
  });
});

describe("shouldSpawnGem", () => {
  it("returns false before the zone's midpoint", () => {
    expect(shouldSpawnGem("old-town", 40, 50, new Set())).toBe(false);
  });

  it("returns true at or after the midpoint when the zone hasn't been gemmed yet", () => {
    expect(shouldSpawnGem("old-town", 50, 50, new Set())).toBe(true);
    expect(shouldSpawnGem("old-town", 90, 50, new Set())).toBe(true);
  });

  it("returns false once the zone has already been gemmed", () => {
    expect(shouldSpawnGem("old-town", 90, 50, new Set(["old-town"]))).toBe(
      false,
    );
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
    expect(collected).toEqual([{ defId: "coin", score: 10, sfx: "coin" }]);
    expect(items).toHaveLength(0);
  });

  it("reports the collected item's defId so callers can distinguish coin from gem", () => {
    const items: EntityInstance[] = [
      { defId: "gem", lane: 0, x: 45, y: 205, width: 12, height: 12 },
    ];
    const collected = advanceItems(items, 0, 320, player);
    expect(collected).toEqual([{ defId: "gem", score: 50, sfx: "coin" }]);
  });
});

describe("PLAYER_SIZE", () => {
  it("matches the RND-01 logical player sprite size", () => {
    expect(PLAYER_SIZE).toEqual({ w: 24, h: 32 });
  });
});

describe("ENT-06 sprite binding", () => {
  it("binds every entity to the entities sheet with frames matching its own size", () => {
    for (const def of Object.values(ENTITY_DEFS)) {
      expect(def.sprite).not.toBeNull();
      const sprite = def.sprite;
      if (!sprite) continue;
      expect(sprite.sheet).toBe("entities");
      expect(sprite.animation).toBe(def.id);
      const sheet = SPRITE_SHEETS[sprite.sheet];
      expect(sheet).toBeDefined();
      const anim = sheet.animations[sprite.animation];
      expect(anim).toBeDefined();
      for (const frame of anim.frames) {
        expect(frame.w).toBe(def.size.w);
        expect(frame.h).toBe(def.size.h);
      }
    }
  });
});
