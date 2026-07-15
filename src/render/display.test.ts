import { describe, expect, it } from "vitest";
import { computeDisplayFit } from "./display";

describe("computeDisplayFit", () => {
  it("fits width-constrained boxes by shrinking to the available height", () => {
    // Box is wider relative to its height than the 180x320 logical aspect,
    // so height is the binding constraint.
    const fit = computeDisplayFit(1000, 320, 180, 320, 1);
    expect(fit.cssH).toBe(320);
    expect(fit.cssW).toBeLessThanOrEqual(1000);
  });

  it("fits height-constrained boxes by shrinking to the available width", () => {
    // Box is taller relative to its width than the logical aspect, so width
    // is the binding constraint.
    const fit = computeDisplayFit(180, 2000, 180, 320, 1);
    expect(fit.cssW).toBe(180);
    expect(fit.cssH).toBeLessThanOrEqual(2000);
  });

  it("floors the integer scale k from the backing/logical ratio", () => {
    const fit = computeDisplayFit(360, 640, 180, 320, 1);
    expect(fit.k).toBe(2);
  });

  it("never picks a scale below 1 even for a box smaller than logical size", () => {
    const fit = computeDisplayFit(10, 10, 180, 320, 1);
    expect(fit.k).toBe(1);
  });

  it("scales the backing store by dpr on top of the css size", () => {
    const fit = computeDisplayFit(360, 640, 180, 320, 2);
    expect(fit.backingW).toBe(fit.cssW * 2);
    expect(fit.backingH).toBe(fit.cssH * 2);
  });

  it("centers the logical canvas within the backing store via dx/dy", () => {
    const fit = computeDisplayFit(400, 640, 180, 320, 1);
    expect(fit.dx).toBe(Math.floor((fit.backingW - 180 * fit.k) / 2));
    expect(fit.dy).toBe(Math.floor((fit.backingH - 320 * fit.k) / 2));
  });
});
