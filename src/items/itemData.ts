import type { AttackDef } from "../characters/attacks";

export type ItemId = "wrench" | "bomb" | "blaster" | "burger" | "star";

/**
 * What pressing the attack button does while this item is held.
 *
 * - `melee`  — the item replaces the normal light attack with a heavier swing
 * - `throw`  — the item is lobbed in an arc and detonates
 * - `shoot`  — the item fires a straight projectile and stays in hand
 * - `instant`— never held at all; it takes effect the moment it is touched
 */
export type ItemUse = "melee" | "throw" | "shoot" | "instant";

export interface ProjectileDef {
  /** Forward launch speed, m/s. */
  speed: number;
  /** Upward kick at launch — the difference between a lob and a laser. */
  upwardSpeed: number;
  /** 0 = flies dead straight, 1 = full gravity. */
  gravityScale: number;
  /** Collision radius, meters. */
  radius: number;
  /** Seconds before it expires on its own. */
  life: number;
  /** > 0 detonates in a radius on impact; 0 deals a direct hit to one target. */
  explosionRadius: number;
  damage: number;
  knockbackBase: number;
  color: number;
}

export interface InstantEffect {
  /** Damage percent removed on pickup. */
  heal?: number;
  /** Seconds of invulnerability granted. */
  invuln?: number;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  use: ItemUse;
  /** How many times a held item can be used before it is spent. */
  uses: number;
  /** Seconds a held item survives regardless of use. 0 = until spent. */
  holdTime: number;
  /** Drives the pickup flash, the HUD chip and the item's own palette. */
  color: number;
  /** One-line HUD description of what the attack button will do. */
  hint: string;
  /** melee only: the swing that replaces the light attack while held. */
  attack?: AttackDef;
  /** throw / shoot only. */
  projectile?: ProjectileDef;
  /** instant only. */
  instant?: InstantEffect;
}

/**
 * The item swing is deliberately slower than every character's light attack
 * (0.14s startup against 0.06–0.1s) and hits far harder. That trade is what
 * makes an item worth picking up without making the fighter who grabbed it
 * unbeatable: the telegraph is long enough to guard or dodge.
 */
const WRENCH_SWING: AttackDef = {
  id: "item_wrench",
  name: "デカスパナ",
  damage: 17,
  knockbackBase: 13,
  knockbackScale: 0.5,
  range: 2.3,
  angle: Math.PI / 2.6,
  startup: 0.14,
  activeTime: 0.12,
  recovery: 0.26,
  cooldown: 0.1,
  hitStun: 0.42,
  direction: "horizontal",
  effect: "shockwave",
  sound: "heavyAttack",
  guardBreakAmount: 32,
};

export const ITEMS: Record<ItemId, ItemDef> = {
  wrench: {
    id: "wrench",
    name: "デカスパナ",
    use: "melee",
    uses: 5,
    holdTime: 20,
    color: 0xb8c4d0,
    hint: "攻撃ボタンで大振り",
    attack: WRENCH_SWING,
  },
  bomb: {
    id: "bomb",
    name: "ドラム缶ボム",
    use: "throw",
    uses: 1,
    holdTime: 14,
    color: 0xd6362f,
    hint: "攻撃ボタンで投げる",
    projectile: {
      speed: 15,
      upwardSpeed: 6.5,
      gravityScale: 1,
      radius: 0.34,
      life: 4,
      explosionRadius: 3.6,
      damage: 22,
      knockbackBase: 16,
      color: 0xd6362f,
    },
  },
  blaster: {
    id: "blaster",
    name: "ジャンクブラスター",
    use: "shoot",
    uses: 6,
    holdTime: 16,
    color: 0x35e6ff,
    hint: "攻撃ボタンで連射",
    projectile: {
      speed: 30,
      upwardSpeed: 0,
      gravityScale: 0,
      radius: 0.22,
      life: 1.1,
      explosionRadius: 0,
      damage: 7,
      knockbackBase: 6,
      color: 0x35e6ff,
    },
  },
  burger: {
    id: "burger",
    name: "ジャンクバーガー",
    use: "instant",
    uses: 0,
    holdTime: 0,
    color: 0xf0a03c,
    hint: "拾うとダメージ回復",
    instant: { heal: 32 },
  },
  star: {
    id: "star",
    name: "ゴールドギア",
    use: "instant",
    uses: 0,
    holdTime: 0,
    color: 0xffd54f,
    hint: "拾うと一定時間無敵",
    instant: { invuln: 6.5 },
  },
};

/**
 * Spawn weights. The two instant items are rarer than the weapons: they end
 * an exchange rather than starting one, so a common heal would stall matches.
 */
export const ITEM_SPAWN_WEIGHTS: Record<ItemId, number> = {
  wrench: 26,
  bomb: 26,
  blaster: 22,
  burger: 15,
  star: 11,
};

/** Movement speed multiplier while the star's invulnerability is running. */
export const STAR_SPEED_MULT = 1.3;

export const ITEM_ORDER: ItemId[] = ["wrench", "bomb", "blaster", "burger", "star"];
