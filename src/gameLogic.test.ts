import { describe, expect, it } from "vitest";
import {
  type Box,
  calculateLevel,
  calculateScore,
  checkCollision,
  isGameCleared,
  PICKUP_MARGIN_RATE,
  spawnGapForZone,
  TARGET_DISTANCE,
  zoneRangeAt,
} from "./gameLogic";

describe("zoneRangeAt", () => {
  it.each([
    [0, "old-town", 0, 50],
    [50, "old-town", 0, 50],
    [50.5, "market-street", 50, 150],
    [150, "market-street", 50, 150],
    [151, "castle-road", 150, TARGET_DISTANCE],
    [300, "castle-road", 150, TARGET_DISTANCE],
  ])("at distance %f resolves zone %s spanning %f..%f", (distance, id, start, end) => {
    const range = zoneRangeAt(distance);
    expect(range.zone.id).toBe(id);
    expect(range.start).toBe(start);
    expect(range.end).toBe(end);
  });
});

describe("spawnGapForZone", () => {
  it.each([
    [0, 7],
    [25, 6.5],
    [50, 6],
    [51, 6.49],
    [100, 6],
    [150, 5.5],
    [151, 5.9944],
    [195, 5.75],
    [240, 5.5],
    [300, 5.5],
  ])("returns %f m gap at distance %f", (distance, expected) => {
    expect(spawnGapForZone(distance)).toBeCloseTo(expected);
  });
});

describe("calculateLevel", () => {
  it.each([
    [-1, { level: 1, speed: 7 }],
    [0, { level: 1, speed: 7 }],
    [50, { level: 1, speed: 7 }],
    [50.5, { level: 2, speed: 10 }],
    [51, { level: 2, speed: 10 }],
    [150, { level: 2, speed: 10 }],
    [151, { level: 3, speed: 13 }],
    [239, { level: 3, speed: 13 }],
    [240, { level: 3, speed: 13 }],
    [241, { level: 3, speed: 13 }],
  ])("returns %j level info for distance %f", (distance, expected) => {
    expect(calculateLevel(distance)).toEqual(expected);
  });
});

describe("isGameCleared", () => {
  it("returns false when distance is below the target", () => {
    expect(isGameCleared(TARGET_DISTANCE - 1, TARGET_DISTANCE)).toBe(false);
  });

  it("returns true when distance equals the target", () => {
    expect(isGameCleared(TARGET_DISTANCE, TARGET_DISTANCE)).toBe(true);
  });

  it("returns true when distance barely exceeds the target", () => {
    expect(isGameCleared(TARGET_DISTANCE + 0.0001, TARGET_DISTANCE)).toBe(true);
  });
});

describe("checkCollision", () => {
  const box = (x: number, y: number, width = 100, height = 100): Box => ({
    x,
    y,
    width,
    height,
  });

  it("returns true for fully overlapping boxes", () => {
    expect(checkCollision(box(0, 0), box(0, 0))).toBe(true);
  });

  it("returns false for fully separated boxes", () => {
    expect(checkCollision(box(0, 0, 10, 10), box(100, 100, 10, 10))).toBe(
      false,
    );
  });

  it("returns false when raw boxes overlap but shrunk boxes do not", () => {
    // Raw overlap is 15px; shrunk boxes span 10..90 and 95..175 on x.
    expect(checkCollision(box(0, 0), box(85, 0))).toBe(false);
  });

  it("returns true when boxes clearly overlap even after shrinking", () => {
    // Shrunk boxes span 10..90 and 60..140 on x.
    expect(checkCollision(box(0, 0), box(50, 0))).toBe(true);
  });

  it("returns false when raw edges merely touch", () => {
    expect(checkCollision(box(0, 0), box(100, 0))).toBe(false);
  });

  it("returns false when shrunk edges merely touch", () => {
    // Shrunk right edge of the first (90) equals shrunk left edge of the second (90).
    expect(checkCollision(box(0, 0), box(80, 0))).toBe(false);
  });

  it("accepts a more generous marginRate where the default rejects", () => {
    // Same pair as "raw boxes overlap but shrunk boxes do not" above: with the
    // default 0.2 margin the shrunk boxes span 10..90 and 95..175 (no overlap).
    expect(checkCollision(box(0, 0), box(85, 0))).toBe(false);
    // PICKUP_MARGIN_RATE (0.1) shrinks less, spanning 5..95 and 90..180 (overlap).
    expect(checkCollision(box(0, 0), box(85, 0), PICKUP_MARGIN_RATE)).toBe(
      true,
    );
  });
});

describe("calculateScore", () => {
  it("floors the distance component", () => {
    expect(calculateScore(123.7, 0)).toBe(123);
  });

  it("adds collected item scores to the floored distance", () => {
    expect(calculateScore(123.7, 30)).toBe(153);
  });

  it("returns 0 for a fresh run", () => {
    expect(calculateScore(0, 0)).toBe(0);
  });
});
