import * as THREE from "three";
import type { Character } from "../characters/Character";
import type { CharacterIntent } from "../characters/CharacterController";
import { CHARACTER_ATTACKS } from "../characters/attacks";
import type { Stage } from "../stage/Stage";
import { AI_PERSONALITIES, type AIPersonality, type AIPersonalityConfig } from "./AIState";
import { chooseAerialAttack } from "./aerialCombat";
import type { ItemTarget } from "../items/ItemManager";
import { GameConfig, type AIDifficulty } from "../config/gameConfig";
import { dampAngle, clamp, randRange } from "../utils/math";
import { horizontalDistance } from "../combat/Hitbox";

/** How far a CPU will travel out of its way for a pickup, in meters, by difficulty. */
const ITEM_INTEREST_RADIUS: Record<AIDifficulty, number> = {
  easy: 5,
  normal: 10,
  hard: 17,
};

const GUARD_HOLD_MIN = 0.16;
const GUARD_HOLD_MAX = 0.34;

/** Signed angle, in radians, between where `self` is facing and where `target` is. */
function angleDelta(self: Character, target: Character): number {
  const desired = Math.atan2(target.position.x - self.position.x, target.position.z - self.position.z);
  let delta = desired - self.facingAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function emptyIntent(): CharacterIntent {
  return {
    moveX: 0,
    moveZ: 0,
    wantJump: false,
    wantLight: false,
    wantHeavy: false,
    wantSpecial: false,
    wantGuard: false,
    wantDash: false,
    wantDodge: false,
  };
}

/**
 * One instance per CPU fighter. Steering/aim runs every frame (cheap) but
 * strategy (target choice, engage vs retreat, attack rolls) only
 * re-evaluates on a personality/difficulty-driven interval, to keep AI cost
 * low with several fighters active at once.
 */
export class CPUController {
  readonly personality: AIPersonality;
  difficulty: AIDifficulty;

  private decisionTimer: number;
  private intent: CharacterIntent = emptyIntent();
  private targetId: string | null = null;
  private reactingToKey: string | null = null;
  private reactionTimer = 0;
  /** Guard is a held input. Once chosen, keep it down long enough to cover an active hitbox. */
  private guardHoldTimer = 0;
  /** Pickup this fighter is currently walking towards, if any. */
  private itemGoal: ItemTarget | null = null;

  constructor(personality: AIPersonality, difficulty: AIDifficulty) {
    this.personality = personality;
    this.difficulty = difficulty;
    this.decisionTimer = randRange(0, 0.3);
  }

  get debugTarget(): string | null {
    return this.targetId;
  }

  /** Drops decisions and held inputs that belonged to the previous match. */
  reset(): void {
    this.intent = emptyIntent();
    this.targetId = null;
    this.reactingToKey = null;
    this.reactionTimer = 0;
    this.guardHoldTimer = 0;
    this.decisionTimer = 0;
    this.itemGoal = null;
  }

  update(
    dt: number,
    self: Character,
    others: Character[],
    stage: Stage,
    items: ItemTarget[] = []
  ): CharacterIntent {
    if (!self.alive) return emptyIntent();

    // Button presses are pulses, not held inputs. Clear them before making this
    // frame's decisions so an old jump/attack cannot fire later after landing,
    // leaving hitstun, or waiting for a cooldown to expire.
    this.intent.wantJump = false;
    this.intent.wantLight = false;
    this.intent.wantHeavy = false;
    this.intent.wantSpecial = false;
    this.intent.wantDodge = false;

    const cfg = AI_PERSONALITIES[this.personality];
    const alive = others.filter((o) => o.alive);

    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = GameConfig.ai.decisionInterval[this.difficulty] * (0.8 + Math.random() * 0.4);
      this.chooseItemGoal(self, items);
      this.makeDecision(self, alive, cfg);
    }

    this.reactToThreats(dt, self, alive, cfg);
    if (this.itemGoal && this.steerToItem(self, stage)) return this.intent;
    this.steer(self, alive, stage, cfg);

    return this.intent;
  }

  // --- items -------------------------------------------------------------

  /**
   * Picks a pickup worth detouring for. The search radius scales with
   * difficulty: an easy CPU only notices what it nearly walks into, while a
   * hard one will cross the arena for a weapon — which is most of what makes
   * the item game feel contested rather than free for the player.
   */
  private chooseItemGoal(self: Character, items: ItemTarget[]): void {
    if (self.heldItem || items.length === 0) {
      this.itemGoal = null;
      return;
    }

    const reach = ITEM_INTEREST_RADIUS[this.difficulty];
    let best: ItemTarget | null = null;
    let bestDist = Infinity;
    for (const item of items) {
      const dist = horizontalDistance(self.position, item.position);
      // Chasing something still in the air means standing in the open under it;
      // the extra tolerance is what lets a CPU camp a landing spot.
      if (dist > (item.falling ? reach * 0.6 : reach)) continue;
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
    this.itemGoal = best;
  }

  /** @returns true when the CPU is committed to the pickup and normal steering should be skipped. */
  private steerToItem(self: Character, stage: Stage): boolean {
    const goal = this.itemGoal;
    if (!goal || self.heldItem) {
      this.itemGoal = null;
      return false;
    }

    const toItem = new THREE.Vector3().subVectors(goal.position, self.position);
    toItem.y = 0;
    const dist = toItem.length();
    if (dist > 0.001) toItem.normalize();

    // Never chase a pickup off the edge — a free wrench is not worth a stock.
    const nextX = self.position.x + toItem.x * 1.5;
    const nextZ = self.position.z + toItem.z * 1.5;
    if (stage.isOverVoid(nextX, nextZ)) {
      this.itemGoal = null;
      return false;
    }

    self.facingAngle = dampAngle(self.facingAngle, Math.atan2(toItem.x, toItem.z), 10, 1 / 60);
    this.intent.moveX = clamp(toItem.x, -1, 1);
    this.intent.moveZ = clamp(toItem.z, -1, 1);
    this.intent.wantDash = dist > 6;
    // A pickup sitting on a platform has to be jumped up to.
    if (goal.position.y > self.position.y + 1.2 && self.grounded) this.intent.wantJump = true;
    return true;
  }

  // --- strategy (runs on decision interval) ---------------------------

  private makeDecision(self: Character, alive: Character[], cfg: AIPersonalityConfig): void {
    const target = this.pickTarget(self, alive);
    this.targetId = target?.instanceId ?? null;

    this.intent.wantDash = false;
    if (!target) return;

    const dist = horizontalDistance(self.position, target.position);
    const mistake = Math.random() < GameConfig.ai.mistakeChance[this.difficulty];

    // A ranged item rewrites the CPU's idea of "in range": it should be firing
    // the blaster or lobbing the bomb from where its bare fists would be useless.
    const itemUse = self.heldItem?.def.use;
    if ((itemUse === "shoot" || itemUse === "throw") && self.grounded && self.hitstunTimer <= 0) {
      const itemRange = itemUse === "shoot" ? 18 : 9;
      const facingTarget = Math.abs(angleDelta(self, target)) < 0.5;
      if (dist <= itemRange && facingTarget && !mistake && self.attackCooldowns.light <= 0) {
        this.intent.wantLight = true;
        return;
      }
    }

    // Air attacks used to exist only for the human player in practice because
    // CPU attack rolls were gated behind self.grounded. That made the newly
    // added air-light/spike pair invisible on three quarters of the roster.
    // Choose from the real aerial hitbox ranges and only spike downward targets.
    if (!self.grounded && self.hitstunTimer <= 0 && !mistake) {
      const attacks = CHARACTER_ATTACKS[self.def.id];
      const choice = chooseAerialAttack({
        selfY: self.position.y,
        targetY: target.position.y,
        horizontalDistance: dist,
        lightRange: attacks.airLight.range,
        heavyRange: attacks.airHeavy.range,
        lightReady: self.attackCooldowns.light <= 0,
        heavyReady: self.attackCooldowns.heavy <= 0,
        roll: Math.random(),
        spikeChance: 0.25 + cfg.aggression * 0.5,
      });
      if (choice === "heavy") {
        this.intent.wantHeavy = true;
        return;
      }
      if (choice === "light") {
        this.intent.wantLight = true;
        return;
      }
    }

    const inRange = dist <= cfg.preferredRange * 1.15;
    const wantsToBeCareful = self.damagePercent > cfg.cautiousDamageThreshold && !mistake;

    if (inRange && self.grounded && self.hitstunTimer <= 0) {
      const roll = Math.random();
      if (!wantsToBeCareful || roll < cfg.aggression * 0.6) {
        if (roll < 0.12 && self.attackCooldowns.special <= 0) {
          this.intent.wantSpecial = true;
        } else if (roll < 0.4 && self.attackCooldowns.heavy <= 0) {
          this.intent.wantHeavy = true;
        } else if (self.attackCooldowns.light <= 0) {
          this.intent.wantLight = true;
        }
      }
    }

    if (dist > cfg.preferredRange * 1.4 && Math.random() < cfg.aggression) {
      this.intent.wantDash = true;
    }

    if (dist < 1.0 && Math.random() < 0.4 && self.grounded && !target.grounded) {
      this.intent.wantJump = true;
    }
  }

  private pickTarget(self: Character, alive: Character[]): Character | null {
    const candidates = alive.filter((o) => o.instanceId !== self.instanceId);
    if (candidates.length === 0) return null;

    let best: Character | null = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const dist = Math.max(0.5, horizontalDistance(self.position, c.position));
      const proximityScore = 12 / dist;
      const damageScore = c.damagePercent * 0.06;
      const playerBias = c.isPlayer ? 1.15 : 1;
      const score = (proximityScore + damageScore) * playerBias * (0.85 + Math.random() * 0.3);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // --- reactive defense (every frame) ---------------------------------

  private reactToThreats(dt: number, self: Character, alive: Character[], cfg: AIPersonalityConfig): void {
    this.intent.wantDodge = false;

    if (self.hitstunTimer > 0 || self.state === "attack" || self.isDodging) {
      this.reactingToKey = null;
      this.guardHoldTimer = 0;
      this.intent.wantGuard = false;
      return;
    }

    // Guard is semantically a held button. The old AI rolled a fresh defense
    // every frame, so a successful guard decision often lasted one 60 Hz tick
    // and released before the opponent's active frames arrived. Commit to it
    // briefly once chosen instead of flickering the shield on and off.
    if (this.guardHoldTimer > 0) {
      this.guardHoldTimer = Math.max(0, this.guardHoldTimer - dt);
      this.intent.wantGuard = true;
      return;
    }
    this.intent.wantGuard = false;

    let threat: Character | null = null;
    for (const c of alive) {
      if (c.state !== "attack" || c.attackPhase === "recovery" || !c.currentAttack) continue;
      const dist = horizontalDistance(self.position, c.position);
      if (dist <= c.currentAttack.range + 1.6) {
        threat = c;
        break;
      }
    }

    if (!threat) {
      this.reactingToKey = null;
      return;
    }

    const key = `${threat.instanceId}:${threat.currentAttack?.id}:${threat.attackPhase}`;
    if (this.reactingToKey !== key) {
      this.reactingToKey = key;
      this.reactionTimer = GameConfig.ai.reactionDelay[this.difficulty];
    }

    this.reactionTimer -= dt;
    if (this.reactionTimer > 0) return;

    const roll = Math.random();
    if (roll < cfg.dodgeChance) {
      this.intent.wantDodge = true;
    } else if (roll < cfg.dodgeChance + cfg.guardChance && self.grounded) {
      this.guardHoldTimer = randRange(GUARD_HOLD_MIN, GUARD_HOLD_MAX);
      this.intent.wantGuard = true;
    }
  }

  // --- movement steering (every frame) ---------------------------------

  private steer(self: Character, alive: Character[], stage: Stage, cfg: AIPersonalityConfig): void {
    const target = this.targetId ? alive.find((c) => c.instanceId === this.targetId) ?? null : null;
    const distFromCenter = Math.hypot(self.position.x, self.position.z);
    const edgeDanger = distFromCenter > stage.arenaRadius - 3.5;
    const fallingOff = !self.grounded && (distFromCenter > stage.arenaRadius || self.position.y < -2);

    let dirX = 0;
    let dirZ = 0;

    if (fallingOff) {
      const toCenter = new THREE.Vector3(-self.position.x, 0, -self.position.z);
      if (toCenter.lengthSq() > 0.001) toCenter.normalize();
      dirX = toCenter.x;
      dirZ = toCenter.z;
      this.intent.wantJump = true;
    } else if (target) {
      const toTarget = new THREE.Vector3().subVectors(target.position, self.position);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist > 0.001) toTarget.normalize();

      if (dist > cfg.preferredRange * 1.1) {
        dirX = toTarget.x;
        dirZ = toTarget.z;
      } else if (dist < cfg.preferredRange * 0.55) {
        dirX = -toTarget.x * 0.6;
        dirZ = -toTarget.z * 0.6;
      } else {
        dirX = -toTarget.z * 0.5;
        dirZ = toTarget.x * 0.5;
      }

      const desiredFacing = Math.atan2(toTarget.x, toTarget.z);
      self.facingAngle = dampAngle(self.facingAngle, desiredFacing, 10, 1 / 60);

      if (edgeDanger && cfg.edgeCaution > 0.4) {
        const toCenter = new THREE.Vector3(-self.position.x, 0, -self.position.z).normalize();
        dirX = dirX * 0.4 + toCenter.x * 0.6;
        dirZ = dirZ * 0.4 + toCenter.z * 0.6;
      }

      this.avoidObstacles(self, stage, dirX, dirZ);
      return;
    } else {
      const toCenter = new THREE.Vector3(-self.position.x, 0, -self.position.z);
      if (toCenter.lengthSq() > 1) {
        toCenter.normalize();
        dirX = toCenter.x * 0.3;
        dirZ = toCenter.z * 0.3;
      }
    }

    this.intent.moveX = clamp(dirX, -1, 1);
    this.intent.moveZ = clamp(dirZ, -1, 1);
  }

  private avoidObstacles(self: Character, stage: Stage, dirX: number, dirZ: number): void {
    let outX = dirX;
    let outZ = dirZ;
    for (const obs of stage.staticColliders) {
      const dx = obs.x - self.position.x;
      const dz = obs.z - self.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < obs.radius + 1.4 && dist > 0.01) {
        const toward = dx * dirX + dz * dirZ;
        if (toward > 0) {
          const perpX = -dz / dist;
          const perpZ = dx / dist;
          outX = dirX + perpX * 0.8;
          outZ = dirZ + perpZ * 0.8;
        }
      }
    }
    this.intent.moveX = clamp(outX, -1, 1);
    this.intent.moveZ = clamp(outZ, -1, 1);
  }
}
