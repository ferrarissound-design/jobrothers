import { describe, expect, it } from "vitest";
import { chooseAerialAttack } from "./aerialCombat";

const base = {
  selfY: 4,
  targetY: 4,
  horizontalDistance: 1.5,
  lightRange: 2,
  heavyRange: 2.2,
  lightReady: true,
  heavyReady: true,
  roll: 0,
  spikeChance: 0.5,
};

describe("chooseAerialAttack", () => {
  it("uses a spike when the opponent is at or below the CPU and the roll commits", () => {
    expect(chooseAerialAttack({ ...base, targetY: 2.5, roll: 0.2 })).toBe("heavy");
  });

  it("never spikes an opponent clearly above the attacker", () => {
    expect(chooseAerialAttack({ ...base, targetY: 5.2, roll: 0 })).toBe("light");
  });

  it("falls back to the fast air-light when the spike roll declines", () => {
    expect(chooseAerialAttack({ ...base, targetY: 3.2, roll: 0.9 })).toBe("light");
  });

  it("returns null when neither aerial hitbox can realistically reach", () => {
    expect(chooseAerialAttack({ ...base, horizontalDistance: 8 })).toBeNull();
    expect(chooseAerialAttack({ ...base, targetY: 8 })).toBeNull();
  });

  it("respects cooldown readiness", () => {
    expect(
      chooseAerialAttack({ ...base, targetY: 3, lightReady: false, heavyReady: false })
    ).toBeNull();
  });
});
