import { describe, it, expect } from "vitest";
import { CHARACTER_ATTACKS, attackFor } from "./attacks";
import { CHARACTER_ORDER } from "./characterData";

describe("attackFor", () => {
  const set = CHARACTER_ATTACKS.jorio;

  it("uses the ground pair while grounded", () => {
    expect(attackFor(set, "light", true)).toBe(set.light);
    expect(attackFor(set, "heavy", true)).toBe(set.heavy);
  });

  it("swaps in the aerial pair while airborne", () => {
    expect(attackFor(set, "light", false)).toBe(set.airLight);
    expect(attackFor(set, "heavy", false)).toBe(set.airHeavy);
  });

  it("keeps the special the same on the ground and in the air", () => {
    expect(attackFor(set, "special", true)).toBe(set.special);
    expect(attackFor(set, "special", false)).toBe(set.special);
  });
});

describe("aerial attack table", () => {
  it("gives every fighter an aerial pair", () => {
    for (const id of CHARACTER_ORDER) {
      expect(CHARACTER_ATTACKS[id].airLight).toBeDefined();
      expect(CHARACTER_ATTACKS[id].airHeavy).toBeDefined();
    }
  });

  it("makes every air-heavy a spike that can only reach at or below the attacker", () => {
    for (const id of CHARACTER_ORDER) {
      const spike = CHARACTER_ATTACKS[id].airHeavy;
      expect(spike.direction).toBe("spike");
      expect(spike.verticalBand).toBeDefined();
      expect(spike.verticalBand!.min).toBeLessThan(0);
      // A small positive ceiling keeps it forgiving at point-blank range without
      // letting it hit someone standing above the attacker.
      expect(spike.verticalBand!.max).toBeLessThan(1);
    }
  });

  it("leaves ground attacks unconstrained vertically, as before", () => {
    for (const id of CHARACTER_ORDER) {
      expect(CHARACTER_ATTACKS[id].light.verticalBand).toBeUndefined();
      expect(CHARACTER_ATTACKS[id].heavy.verticalBand).toBeUndefined();
      expect(CHARACTER_ATTACKS[id].airLight.verticalBand).toBeUndefined();
    }
  });

  it("keeps the spike slower to start but harder hitting than the air jab", () => {
    for (const id of CHARACTER_ORDER) {
      const { airLight, airHeavy } = CHARACTER_ATTACKS[id];
      expect(airHeavy.startup).toBeGreaterThan(airLight.startup);
      expect(airHeavy.damage).toBeGreaterThan(airLight.damage);
    }
  });

  it("keeps the air jab faster than the same fighter's ground jab", () => {
    for (const id of CHARACTER_ORDER) {
      const { light, airLight } = CHARACTER_ATTACKS[id];
      expect(airLight.startup).toBeLessThanOrEqual(light.startup);
    }
  });
});
