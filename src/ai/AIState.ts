import type { CharacterId } from "../characters/characterData";

export type AIPersonality = "aggressive" | "cautious" | "ranged";

export interface AIPersonalityConfig {
  /** 0..1, how eagerly this personality closes distance and presses attacks. */
  aggression: number;
  /** Preferred horizontal distance (meters) to engage from. */
  preferredRange: number;
  /** Chance [0..1] to guard when it notices an incoming attack in time. */
  guardChance: number;
  /** Chance [0..1] to dodge instead of guard (checked first). */
  dodgeChance: number;
  /** Damage% above which the fighter starts favoring safety over pressing attacks. */
  cautiousDamageThreshold: number;
  /** How strongly it avoids the stage edge (higher = more cautious near the ledge). */
  edgeCaution: number;
}

export const AI_PERSONALITIES: Record<AIPersonality, AIPersonalityConfig> = {
  aggressive: {
    aggression: 0.88,
    preferredRange: 1.5,
    guardChance: 0.12,
    dodgeChance: 0.22,
    cautiousDamageThreshold: 150,
    edgeCaution: 0.5,
  },
  cautious: {
    aggression: 0.42,
    preferredRange: 1.8,
    guardChance: 0.5,
    dodgeChance: 0.35,
    cautiousDamageThreshold: 85,
    edgeCaution: 1,
  },
  ranged: {
    aggression: 0.5,
    preferredRange: 4.2,
    guardChance: 0.3,
    dodgeChance: 0.3,
    cautiousDamageThreshold: 110,
    edgeCaution: 0.75,
  },
};

/**
 * Which personality a fighter plays with when the CPU takes it over. Tied to
 * the character rather than to the roster slot, so whoever the player leaves
 * behind still fights the way that character is designed to: the featherweight
 * rushes, the speedster picks its moments, the heavy zones from range.
 */
export const CHARACTER_PERSONALITY: Record<CharacterId, AIPersonality> = {
  jorio: "aggressive",
  birinezu: "aggressive",
  hayasugi: "cautious",
  danboru: "ranged",
};
