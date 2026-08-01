import { describe, it, expect } from "vitest";
import { clamp, lerp, damp, randRange, angleDiff, dampAngle } from "./math";

describe("clamp", () => {
  it("passes values inside the range through unchanged", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it("clamps below the minimum", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it("clamps above the maximum", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("lerp", () => {
  it("returns a at t=0 and b at t=1", () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });
  it("interpolates at the midpoint", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  it("clamps t outside [0,1] instead of extrapolating", () => {
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe("damp", () => {
  it("does not move when already at the target", () => {
    expect(damp(5, 5, 10, 1 / 60)).toBeCloseTo(5);
  });
  it("moves partway towards the target for a finite dt", () => {
    const result = damp(0, 10, 10, 1 / 60);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(10);
  });
  it("converges on the target as dt grows", () => {
    expect(damp(0, 10, 10, 5)).toBeCloseTo(10, 3);
  });
});

describe("randRange", () => {
  it("stays within [min, max] across many samples", () => {
    for (let i = 0; i < 200; i++) {
      const v = randRange(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
    }
  });
});

describe("angleDiff", () => {
  it("returns 0 for equal angles", () => {
    expect(angleDiff(1.2, 1.2)).toBeCloseTo(0);
  });
  it("takes the short way around when crossing the +/-PI seam", () => {
    // From just past +PI to just past -PI is a short hop forward, not a
    // near-full-circle trip backward.
    const diff = angleDiff(Math.PI - 0.1, -Math.PI + 0.1);
    expect(diff).toBeCloseTo(0.2, 5);
  });
  it("stays within [-PI, PI]", () => {
    const diff = angleDiff(0, Math.PI * 3);
    expect(diff).toBeGreaterThanOrEqual(-Math.PI);
    expect(diff).toBeLessThanOrEqual(Math.PI);
  });
});

describe("dampAngle", () => {
  it("wraps through the short way, not the long way around", () => {
    // Same seam-crossing case as angleDiff, but through the damped step.
    const result = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 10, 1 / 60);
    expect(result).toBeGreaterThan(Math.PI - 0.1);
  });
});
