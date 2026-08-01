import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { forwardFromYaw, isInFrontCone, horizontalDistance } from "./Hitbox";

describe("forwardFromYaw", () => {
  it("faces +Z at yaw 0", () => {
    const f = forwardFromYaw(0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(1);
  });
  it("faces +X at yaw PI/2", () => {
    const f = forwardFromYaw(Math.PI / 2);
    expect(f.x).toBeCloseTo(1);
    expect(f.z).toBeCloseTo(0);
  });
});

describe("horizontalDistance", () => {
  it("ignores the Y axis", () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(3, 99, 4);
    expect(horizontalDistance(a, b)).toBeCloseTo(5);
  });
});

describe("isInFrontCone", () => {
  const origin = new THREE.Vector3(0, 0, 0);
  const facingForward = 0; // +Z

  it("hits a target directly ahead, within range", () => {
    const target = new THREE.Vector3(0, 0, 2);
    expect(isInFrontCone(origin, facingForward, target, 3, Math.PI / 4)).toBe(true);
  });

  it("misses a target beyond range", () => {
    const target = new THREE.Vector3(0, 0, 10);
    expect(isInFrontCone(origin, facingForward, target, 3, Math.PI / 4)).toBe(false);
  });

  it("misses a target behind the attacker", () => {
    const target = new THREE.Vector3(0, 0, -2);
    expect(isInFrontCone(origin, facingForward, target, 3, Math.PI / 4)).toBe(false);
  });

  it("misses a target outside the cone's half-angle to the side", () => {
    const target = new THREE.Vector3(2, 0, 0.1);
    expect(isInFrontCone(origin, facingForward, target, 3, Math.PI / 8)).toBe(false);
  });

  it("extends reach by attacker + target radius", () => {
    const target = new THREE.Vector3(0, 0, 3.5);
    expect(isInFrontCone(origin, facingForward, target, 3, Math.PI / 4, 0.3, 0.3)).toBe(true);
  });

  it("always hits when standing on top of the target", () => {
    expect(isInFrontCone(origin, facingForward, origin.clone(), 3, 0.01)).toBe(true);
  });
});
