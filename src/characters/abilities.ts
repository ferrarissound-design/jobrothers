import type { CharacterId } from "./characterData";

/**
 * Most specials are just a bigger attack and are resolved through the normal
 * hitbox pipeline (see attacks.ts). A few characters need bespoke runtime
 * behavior; this table + the constants below drive that special-cased logic
 * in CharacterController / CombatSystem.
 */
export type SpecialBehavior = "hitbox" | "buff" | "mine";

export const SPECIAL_BEHAVIOR: Record<CharacterId, SpecialBehavior> = {
  jorio: "hitbox",
  birinezu: "hitbox",
  hayasugi: "buff",
  danboru: "mine",
};

// --- Hayasugi: Hyper Dash Mode ---
export const HYPER_MODE_DURATION = 4.5;
export const HYPER_MODE_SPEED_MULT = 1.55;
export const HYPER_MODE_ATTACK_MULT = 1.3;
/** 0 = full control, higher = more overshoot/drift while turning (harder to control). */
export const HYPER_MODE_CONTROL_PENALTY = 0.5;

// --- Danboru: mine trap ---
export const MINE_MAX_ACTIVE = 3;
export const MINE_TRIGGER_RADIUS = 1.5;
export const MINE_ARM_DELAY = 0.4; // grace period before it can trigger (avoids self-detonation on place)
export const MINE_LIFETIME = 16;
export const MINE_PLACE_DISTANCE = 1.3;
