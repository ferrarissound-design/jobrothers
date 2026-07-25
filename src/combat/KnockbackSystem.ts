import * as THREE from "three";
import type { AttackDef } from "../characters/attacks";
import type { Character } from "../characters/Character";
import { GameConfig } from "../config/gameConfig";
import { clamp } from "../utils/math";

export interface KnockbackResult {
  velocity: THREE.Vector3;
  hitstun: number;
  power: number;
}

/**
 * 吹き飛ばし力 ＝ (基礎吹き飛ばし力 ＋ 吹き飛ばし成長率 × 蓄積ダメージ) × 攻撃側の吹き飛ばし力補正 ÷ 防御側の重量
 * Growing linearly with accumulated damage (rather than a steep exponential)
 * keeps early hits light and lets knockback ramp up gradually toward the
 * clamp as damage% climbs, matching typical platform-fighter feel. All
 * multipliers are exposed through gameConfig.knockback and each character's
 * stats, so the feel can be tuned without touching this formula.
 */
export function computeKnockback(
  attack: AttackDef,
  attacker: Character,
  defender: Character,
  hitDirWorld: THREE.Vector3
): KnockbackResult {
  const cfg = GameConfig.knockback;

  const weightFactor = clamp(1 / Math.max(0.3, defender.stats.weight), 0.5, 2.2);
  const rawPower =
    (attack.knockbackBase + attack.knockbackScale * defender.damagePercent) *
    attacker.stats.knockbackPower *
    weightFactor;

  let power = rawPower * cfg.baseScale;

  if (!defender.grounded) power *= 1.06;

  power = clamp(power, 1, cfg.launchClamp);

  const dir = new THREE.Vector3(hitDirWorld.x, 0, hitDirWorld.z);
  if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
  dir.normalize();

  switch (attack.direction) {
    case "upward":
      dir.set(dir.x * 0.35, 0, dir.z * 0.35);
      dir.y = 1.0;
      break;
    case "spike":
      dir.set(dir.x * 0.45, 0, dir.z * 0.45);
      dir.y = -0.9;
      break;
    case "forward":
      dir.y = 0.18;
      break;
    case "horizontal":
    default:
      dir.y = 0.32;
      break;
  }
  dir.normalize();

  const velocity = dir.multiplyScalar(power);
  const hitstun = clamp(attack.hitStun + power * cfg.hitstunPerPower * 0.12, 0.08, cfg.hitstunClamp);

  return { velocity, hitstun, power };
}
