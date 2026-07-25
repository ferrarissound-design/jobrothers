import type { CharacterId } from "./characterData";
import type { SfxName } from "../core/AudioManager";

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
}

export interface CharacterAttackSet {
  light: AttackDef;
  heavy: AttackDef;
  special: AttackDef;
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
  },
};
