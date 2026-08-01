import type { CharacterId } from "./characterData";
import type { SfxName } from "../core/AudioManager";
import type { VerticalBand } from "../combat/Hitbox";

export type AttackDirection = "horizontal" | "upward" | "forward" | "spike";
export type AttackEffect = "spark" | "impact" | "electric" | "explosion" | "shockwave";

export interface AttackDef {
  id: string;
  name: string;
  /** Base damage added to the target's damage percent. */
  damage: number;
  /** Base launch speed before damage/weight scaling. */
  knockbackBase: number;
  /** How much accumulated damage amplifies knockback. */
  knockbackScale: number;
  /** Hit range (meters) from the attacker's center. */
  range: number;
  /** Half-angle (radians) of the frontal hit cone. */
  angle: number;
  /** Seconds before the hitbox becomes active (telegraph). */
  startup: number;
  /** Seconds the hitbox stays active. */
  activeTime: number;
  /** Seconds of recovery after the active window, attacker is vulnerable. */
  recovery: number;
  /** Seconds before this attack can be used again. */
  cooldown: number;
  /** Hit-stun duration applied to the victim. */
  hitStun: number;
  direction: AttackDirection;
  effect: AttackEffect;
  sound: SfxName;
  /** Extra damage dealt to guard durability when blocked. */
  guardBreakAmount: number;
  /**
   * Height window, relative to the attacker's feet, a target must be inside.
   * Omitted on every ground attack, which stay purely horizontal; spikes use it
   * so they can only connect on someone at or below the attacker.
   */
  verticalBand?: VerticalBand;
}

export interface CharacterAttackSet {
  light: AttackDef;
  heavy: AttackDef;
  special: AttackDef;
  /** Replaces `light` while airborne: faster and weaker than the ground jab. */
  airLight: AttackDef;
  /** Replaces `heavy` while airborne: the character's spike. */
  airHeavy: AttackDef;
}

/** Height window every spike shares: at the attacker's feet or below them. */
const SPIKE_BAND: VerticalBand = { min: -3.2, max: 0.6 };

/**
 * Picks the attack a button press resolves to. Airborne fighters get their own
 * pair, which is what makes the air game read differently from the ground one —
 * before this both were literally the same move.
 */
export function attackFor(
  set: CharacterAttackSet,
  kind: "light" | "heavy" | "special",
  grounded: boolean
): AttackDef {
  if (kind === "special") return set.special;
  if (grounded) return kind === "light" ? set.light : set.heavy;
  return kind === "light" ? set.airLight : set.airHeavy;
}

export const CHARACTER_ATTACKS: Record<CharacterId, CharacterAttackSet> = {
  jorio: {
    light: {
      id: "jorio_light",
      name: "レンチ横殴り",
      damage: 6,
      knockbackBase: 5,
      knockbackScale: 0.32,
      range: 1.5,
      angle: Math.PI / 2.4,
      startup: 0.08,
      activeTime: 0.1,
      recovery: 0.18,
      cooldown: 0,
      hitStun: 0.28,
      direction: "horizontal",
      effect: "impact",
      sound: "lightAttack",
      guardBreakAmount: 8,
    },
    heavy: {
      id: "jorio_heavy",
      name: "大型レンチ振り下ろし",
      damage: 15,
      knockbackBase: 11,
      knockbackScale: 0.55,
      range: 1.7,
      angle: Math.PI / 3,
      startup: 0.32,
      activeTime: 0.12,
      recovery: 0.4,
      cooldown: 0.2,
      hitStun: 0.5,
      direction: "forward",
      effect: "shockwave",
      sound: "heavyAttack",
      guardBreakAmount: 20,
    },
    special: {
      id: "jorio_special",
      name: "マンホールギザー",
      damage: 18,
      knockbackBase: 14,
      knockbackScale: 0.6,
      range: 2.4,
      angle: Math.PI / 2,
      startup: 0.28,
      activeTime: 0.22,
      recovery: 0.5,
      cooldown: 8,
      hitStun: 0.6,
      direction: "upward",
      effect: "explosion",
      sound: "explosion",
      guardBreakAmount: 26,
    },
    airLight: {
      id: "jorio_air_light",
      name: "空中レンチ払い",
      damage: 5.5,
      knockbackBase: 4.5,
      knockbackScale: 0.28,
      range: 1.5,
      angle: Math.PI / 2.2,
      startup: 0.07,
      activeTime: 0.1,
      recovery: 0.16,
      cooldown: 0,
      hitStun: 0.24,
      direction: "horizontal",
      effect: "spark",
      sound: "lightAttack",
      guardBreakAmount: 7,
    },
    airHeavy: {
      id: "jorio_air_spike",
      name: "レンチ叩き落とし",
      damage: 15,
      knockbackBase: 12,
      knockbackScale: 0.42,
      range: 1.6,
      angle: Math.PI / 2.4,
      startup: 0.22,
      activeTime: 0.12,
      recovery: 0.34,
      cooldown: 0.25,
      hitStun: 0.45,
      direction: "spike",
      effect: "impact",
      sound: "heavyAttack",
      guardBreakAmount: 18,
      verticalBand: SPIKE_BAND,
    },
  },
  birinezu: {
    light: {
      id: "birinezu_light",
      name: "頭突き",
      damage: 4.5,
      knockbackBase: 3.6,
      knockbackScale: 0.26,
      range: 1.2,
      angle: Math.PI / 2.6,
      startup: 0.05,
      activeTime: 0.08,
      recovery: 0.12,
      cooldown: 0,
      hitStun: 0.22,
      direction: "horizontal",
      effect: "spark",
      sound: "lightAttack",
      guardBreakAmount: 6,
    },
    heavy: {
      id: "birinezu_heavy",
      name: "尻尾回転",
      damage: 10,
      knockbackBase: 8,
      knockbackScale: 0.4,
      range: 1.6,
      angle: Math.PI * 0.95,
      startup: 0.22,
      activeTime: 0.28,
      recovery: 0.3,
      cooldown: 0.15,
      hitStun: 0.4,
      direction: "horizontal",
      effect: "impact",
      sound: "heavyAttack",
      guardBreakAmount: 14,
    },
    special: {
      id: "birinezu_special",
      name: "ジグザグスパーク",
      damage: 13,
      knockbackBase: 6,
      knockbackScale: 0.3,
      range: 6.5,
      angle: Math.PI / 5,
      startup: 0.14,
      activeTime: 0.5,
      recovery: 0.35,
      cooldown: 7,
      hitStun: 0.9,
      direction: "forward",
      effect: "electric",
      sound: "electric",
      guardBreakAmount: 16,
    },
    airLight: {
      id: "birinezu_air_light",
      name: "空中しっぽ払い",
      damage: 4,
      knockbackBase: 3.4,
      knockbackScale: 0.24,
      range: 1.3,
      angle: Math.PI / 2,
      startup: 0.05,
      activeTime: 0.09,
      recovery: 0.11,
      cooldown: 0,
      hitStun: 0.2,
      direction: "horizontal",
      effect: "spark",
      sound: "lightAttack",
      guardBreakAmount: 5,
    },
    airHeavy: {
      id: "birinezu_air_spike",
      name: "電撃ドロップ",
      damage: 11,
      knockbackBase: 9.5,
      knockbackScale: 0.34,
      range: 1.3,
      angle: Math.PI / 2.6,
      startup: 0.18,
      activeTime: 0.12,
      recovery: 0.3,
      cooldown: 0.25,
      hitStun: 0.4,
      direction: "spike",
      effect: "electric",
      sound: "electric",
      guardBreakAmount: 13,
      verticalBand: SPIKE_BAND,
    },
  },
  hayasugi: {
    light: {
      id: "hayasugi_light",
      name: "高速パンチ",
      damage: 5,
      knockbackBase: 4,
      knockbackScale: 0.28,
      range: 1.3,
      angle: Math.PI / 2.6,
      startup: 0.06,
      activeTime: 0.08,
      recovery: 0.14,
      cooldown: 0,
      hitStun: 0.24,
      direction: "horizontal",
      effect: "spark",
      sound: "lightAttack",
      guardBreakAmount: 7,
    },
    heavy: {
      id: "hayasugi_heavy",
      name: "回転突進",
      damage: 13,
      knockbackBase: 10,
      knockbackScale: 0.5,
      range: 2.6,
      angle: Math.PI / 4,
      startup: 0.2,
      activeTime: 0.3,
      recovery: 0.32,
      cooldown: 0.1,
      hitStun: 0.45,
      direction: "forward",
      effect: "impact",
      sound: "heavyAttack",
      guardBreakAmount: 16,
    },
    special: {
      id: "hayasugi_special",
      name: "ハイパーダッシュモード",
      damage: 0,
      knockbackBase: 0,
      knockbackScale: 0,
      range: 0,
      angle: 0,
      startup: 0.1,
      activeTime: 0,
      recovery: 0.2,
      cooldown: 11,
      hitStun: 0,
      direction: "forward",
      effect: "spark",
      sound: "electric",
      guardBreakAmount: 0,
    },
    airLight: {
      id: "hayasugi_air_light",
      name: "空中回し蹴り",
      damage: 4.5,
      knockbackBase: 3.8,
      knockbackScale: 0.26,
      range: 1.4,
      angle: Math.PI / 2.2,
      startup: 0.06,
      activeTime: 0.09,
      recovery: 0.13,
      cooldown: 0,
      hitStun: 0.22,
      direction: "horizontal",
      effect: "spark",
      sound: "lightAttack",
      guardBreakAmount: 6,
    },
    airHeavy: {
      id: "hayasugi_air_spike",
      name: "急降下キック",
      damage: 13,
      knockbackBase: 10.5,
      knockbackScale: 0.38,
      range: 1.5,
      angle: Math.PI / 3,
      startup: 0.19,
      activeTime: 0.14,
      recovery: 0.32,
      cooldown: 0.25,
      hitStun: 0.42,
      direction: "spike",
      effect: "impact",
      sound: "heavyAttack",
      guardBreakAmount: 15,
      verticalBand: SPIKE_BAND,
    },
  },
  danboru: {
    light: {
      id: "danboru_light",
      name: "折り畳みスコップ",
      damage: 6.5,
      knockbackBase: 5.5,
      knockbackScale: 0.3,
      range: 1.6,
      angle: Math.PI / 2.4,
      startup: 0.12,
      activeTime: 0.1,
      recovery: 0.22,
      cooldown: 0,
      hitStun: 0.3,
      direction: "horizontal",
      effect: "impact",
      sound: "lightAttack",
      guardBreakAmount: 9,
    },
    heavy: {
      id: "danboru_heavy",
      name: "ロケット花火",
      damage: 16,
      knockbackBase: 12,
      knockbackScale: 0.5,
      range: 9,
      angle: Math.PI / 14,
      startup: 0.3,
      activeTime: 0.4,
      recovery: 0.45,
      cooldown: 0.3,
      hitStun: 0.5,
      direction: "forward",
      effect: "explosion",
      sound: "explosion",
      guardBreakAmount: 22,
    },
    special: {
      id: "danboru_special",
      name: "地雷設置",
      damage: 17,
      knockbackBase: 13,
      knockbackScale: 0.55,
      range: 1.8,
      angle: Math.PI,
      startup: 0.2,
      activeTime: 0.1,
      recovery: 0.35,
      cooldown: 6,
      hitStun: 0.55,
      direction: "upward",
      effect: "explosion",
      sound: "explosion",
      guardBreakAmount: 24,
    },
    airLight: {
      id: "danboru_air_light",
      name: "空中スコップ払い",
      damage: 6,
      knockbackBase: 5,
      knockbackScale: 0.3,
      range: 1.6,
      angle: Math.PI / 2.4,
      startup: 0.1,
      activeTime: 0.11,
      recovery: 0.2,
      cooldown: 0,
      hitStun: 0.26,
      direction: "horizontal",
      effect: "impact",
      sound: "lightAttack",
      guardBreakAmount: 8,
    },
    airHeavy: {
      id: "danboru_air_spike",
      name: "段ボールプレス",
      damage: 17,
      knockbackBase: 13.5,
      knockbackScale: 0.45,
      range: 1.7,
      angle: Math.PI / 2.2,
      startup: 0.28,
      activeTime: 0.14,
      recovery: 0.4,
      cooldown: 0.3,
      hitStun: 0.5,
      direction: "spike",
      effect: "shockwave",
      sound: "heavyAttack",
      guardBreakAmount: 22,
      verticalBand: SPIKE_BAND,
    },
  },
};
