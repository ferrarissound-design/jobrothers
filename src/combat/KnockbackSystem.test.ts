import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { computeKnockback } from "./KnockbackSystem";
import { GameConfig } from "../config/gameConfig";
import type { AttackDef } from "../characters/attacks";
import type { Character } from "../characters/Character";

/** Minimal stand-ins: computeKnockback only reads a handful of fields off each fighter. */
function fighter(opts: { weight?: number; damagePercent?: number; grounded?: boolean; knockbackPower?: number }): Character {
  return {
    stats: { weight: opts.weight ?? 1, knockbackPower: opts.knockbackPower ?? 1 },
    damagePercent: opts.damagePercent ?? 0,
    grounded: opts.grounded ?? true,
  } as unknown as Character;
}

function attack(overrides: Partial<AttackDef> = {}): AttackDef {
  return {
    id: "test",
    name: "test",
    damage: 10,
    knockbackBase: 8,
    knockbackScale: 0.4,
    range: 1.5,
    angle: Math.PI / 3,
    startup: 0.1,
    activeTime: 0.1,
    recovery: 0.2,
    cooldown: 0,
    hitStun: 0.3,
    direction: "horizontal",
    effect: "impact",
    sound: "hit",
    guardBreakAmount: 8,
    ...overrides,
  };
}

const FORWARD = new THREE.Vector3(0, 0, 1);

describe("computeKnockback", () => {
  it("grows with the defender's accumulated damage", () => {
    const attacker = fighter({});
    const low = computeKnockback(attack(), attacker, fighter({ damagePercent: 0 }), FORWARD);
    const high = computeKnockback(attack(), attacker, fighter({ damagePercent: 150 }), FORWARD);
    expect(high.power).toBeGreaterThan(low.power);
  });

  it("launches a heavier defender less far than a lighter one", () => {
    const attacker = fighter({});
    const heavy = computeKnockback(attack(), attacker, fighter({ weight: 2 }), FORWARD);
    const light = computeKnockback(attack(), attacker, fighter({ weight: 0.6 }), FORWARD);
    expect(heavy.power).toBeLessThan(light.power);
  });

  it("clamps power to GameConfig.knockback.launchClamp", () => {
    const attacker = fighter({ knockbackPower: 5 });
    const defender = fighter({ damagePercent: 500 });
    const result = computeKnockback(attack({ knockbackBase: 40, knockbackScale: 2 }), attacker, defender, FORWARD);
    expect(result.power).toBeLessThanOrEqual(GameConfig.knockback.launchClamp);
  });

  it("never launches below a power of 1", () => {
    const attacker = fighter({ knockbackPower: 0.01 });
    const defender = fighter({});
    const result = computeKnockback(attack({ knockbackBase: 0.001, knockbackScale: 0 }), attacker, defender, FORWARD);
    expect(result.power).toBeGreaterThanOrEqual(1);
  });

  it("sends an airborne defender out slightly harder than a grounded one", () => {
    const attacker = fighter({});
    const grounded = computeKnockback(attack(), attacker, fighter({ grounded: true }), FORWARD);
    const airborne = computeKnockback(attack(), attacker, fighter({ grounded: false }), FORWARD);
    expect(airborne.power).toBeGreaterThan(grounded.power);
  });

  it("launches mostly upward for an 'upward' attack", () => {
    const attacker = fighter({});
    const result = computeKnockback(attack({ direction: "upward" }), attacker, fighter({}), FORWARD);
    expect(result.velocity.y).toBeGreaterThan(0);
    expect(result.velocity.y).toBeGreaterThan(Math.hypot(result.velocity.x, result.velocity.z));
  });

  it("launches downward for a 'spike' attack", () => {
    const attacker = fighter({});
    const result = computeKnockback(attack({ direction: "spike" }), attacker, fighter({}), FORWARD);
    expect(result.velocity.y).toBeLessThan(0);
  });

  it("keeps hitstun within GameConfig.knockback.hitstunClamp", () => {
    const attacker = fighter({ knockbackPower: 5 });
    const defender = fighter({ damagePercent: 500 });
    const result = computeKnockback(attack({ knockbackBase: 40, hitStun: 10 }), attacker, defender, FORWARD);
    expect(result.hitstun).toBeLessThanOrEqual(GameConfig.knockback.hitstunClamp);
  });

  it("falls back to +Z when the hit direction is degenerate", () => {
    const attacker = fighter({});
    const result = computeKnockback(attack(), attacker, fighter({}), new THREE.Vector3(0, 5, 0));
    expect(Number.isFinite(result.velocity.x)).toBe(true);
    expect(Number.isFinite(result.velocity.z)).toBe(true);
    expect(result.velocity.lengthSq()).toBeGreaterThan(0);
  });
});
