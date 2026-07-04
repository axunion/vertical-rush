import { describe, expect, it } from "vitest";
import {
  type Box,
  calculateLevel,
  checkCollision,
  isGameCleared,
} from "./gameLogic";

describe("calculateLevel", () => {
  it.each([
    [-1, { level: 1, speed: 5 }],
    [0, { level: 1, speed: 5 }],
    [100, { level: 1, speed: 5 }],
    [100.5, { level: 2, speed: 8 }],
    [101, { level: 2, speed: 8 }],
    [300, { level: 2, speed: 8 }],
    [301, { level: 3, speed: 12 }],
    [499, { level: 3, speed: 12 }],
    [500, { level: 3, speed: 12 }],
    [501, { level: 3, speed: 12 }],
  ])("returns %j level info for distance %f", (distance, expected) => {
    expect(calculateLevel(distance)).toEqual(expected);
  });
});

describe("isGameCleared", () => {
  it("returns false when distance is below the target", () => {
    expect(isGameCleared(499, 500)).toBe(false);
  });

  it("returns true when distance equals the target", () => {
    expect(isGameCleared(500, 500)).toBe(true);
  });

  it("returns true when distance barely exceeds the target", () => {
    expect(isGameCleared(500.0001, 500)).toBe(true);
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
});
