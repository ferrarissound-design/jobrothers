import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { GameConfig } from "../config/gameConfig";
import { findLedgeGrabAt } from "./Stage";

// The real query Stage.findLedgeGrab delegates to. Stage itself cannot be
// constructed here (its constructor needs a WebGL scene and a canvas), which is
// why the geometry lives in a standalone function.
const arenaRadius = GameConfig.arenaRadius;
const ledgeY = 0;
const { grabReach, grabDepth } = GameConfig.ledge;

const grab = (x: number, y: number, z: number) =>
  findLedgeGrabAt(new THREE.Vector3(x, y, z), arenaRadius, ledgeY, grabReach, grabDepth);

describe("findLedgeGrab", () => {
  it("catches a fighter just outside the rim and just below it", () => {
    const normal = grab(arenaRadius + 0.5, -0.8, 0);
    expect(normal).not.toBeNull();
    expect(normal!.x).toBeCloseTo(1);
    expect(normal!.z).toBeCloseTo(0);
  });

  it("returns a unit normal pointing outward, whatever the approach angle", () => {
    const diag = arenaRadius / Math.SQRT2;
    const normal = grab(diag, -0.5, diag);
    expect(normal).not.toBeNull();
    expect(normal!.length()).toBeCloseTo(1);
    expect(normal!.x).toBeCloseTo(Math.SQRT1_2);
    expect(normal!.z).toBeCloseTo(Math.SQRT1_2);
  });

  it("ignores a fighter still well inside the arena", () => {
    expect(grab(0, -0.5, 0)).toBeNull();
    expect(grab(arenaRadius - 5, -0.5, 0)).toBeNull();
  });

  it("ignores a fighter who has already fallen past the grab window", () => {
    expect(grab(arenaRadius + 0.5, -(grabDepth + 1), 0)).toBeNull();
  });

  it("ignores a fighter still above the rim", () => {
    expect(grab(arenaRadius + 0.5, 1.5, 0)).toBeNull();
  });

  it("ignores a fighter thrown far past the reach of the rim", () => {
    expect(grab(arenaRadius + grabReach + 2, -0.5, 0)).toBeNull();
  });
});

describe("ledge tuning", () => {
  it("hangs the fighter inside the window they were caught in", () => {
    // Otherwise the snap position itself would fall outside the grab test and
    // the hang would flicker between catching and dropping.
    expect(GameConfig.ledge.hangDrop).toBeLessThan(grabDepth);
    expect(GameConfig.ledge.hangOffset).toBeLessThan(grabReach);
  });

  it("places a climb-up on solid floor, inside the rim", () => {
    expect(GameConfig.ledge.climbInset).toBeGreaterThan(0);
    expect(GameConfig.ledge.climbInset).toBeLessThan(arenaRadius);
  });
});
