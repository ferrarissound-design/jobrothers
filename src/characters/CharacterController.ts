import * as THREE from "three";
import { Character } from "./Character";
import { CHARACTER_ATTACKS, type AttackDef } from "./attacks";
import {
  SPECIAL_BEHAVIOR,
  HYPER_MODE_DURATION,
  HYPER_MODE_SPEED_MULT,
} from "./abilities";
import type { Stage } from "../stage/Stage";
import type { CombatSystem } from "../combat/CombatSystem";
import type { ItemManager } from "../items/ItemManager";
import { STAR_SPEED_MULT } from "../items/itemData";
import type { EffectManager } from "../core/EffectManager";
import type { AudioManager } from "../core/AudioManager";
import { GameConfig } from "../config/gameConfig";
import { damp } from "../utils/math";
import { forwardFromYaw } from "../combat/Hitbox";

export interface CharacterIntent {
  /** World-space desired movement direction (not required to be normalized). */
  moveX: number;
  moveZ: number;
  wantJump: boolean;
  wantLight: boolean;
  wantHeavy: boolean;
  wantSpecial: boolean;
  wantGuard: boolean;
  wantDash: boolean;
  wantDodge: boolean;
}

const GROUND_ACCEL_LAMBDA = 20;
const GROUND_BRAKE_LAMBDA = 32;
const AIR_TURN_LAMBDA = 9;
const GUARD_PASSIVE_DRAIN = 6;

/**
 * Drives a Character's per-frame state machine: movement, jump, guard,
 * dodge and the light/heavy/special attack pipeline. Used identically for
 * the human player and every CPU fighter — only the incoming intent differs.
 */
export class CharacterController {
  constructor(
    private stage: Stage,
    private combat: CombatSystem,
    private effects: EffectManager,
    private audio: AudioManager,
    private items: ItemManager
  ) {}

  /** Points ground and edge queries at a newly built arena after a stage change. */
  setStage(stage: Stage): void {
    this.stage = stage;
  }

  update(c: Character, intent: CharacterIntent, dt: number): void {
    if (!c.alive) return;

    this.tickTimers(c, dt);
    this.tickDodge(c, dt);
    this.tickAttackPhase(c, dt);

    const locked = c.state === "attack" || c.state === "guardBreak" || c.isDodging;

    // Recovery options: jump / dodge remain available even during hitstun.
    if (!locked) {
      if (intent.wantDodge && c.dodgeCooldownTimer <= 0) {
        this.tryDodge(c, intent);
      } else if (intent.wantJump) {
        this.tryJump(c);
      }
    }

    const canAct = !locked && c.hitstunTimer <= 0;

    if (canAct) {
      this.updateGuard(c, intent);
    }

    if (canAct && !c.isGuarding) {
      this.updateMovement(c, intent, dt);
      this.tryAttacks(c, intent);
    }

    this.applyPhysics(c, dt);
    this.updateAnimation(c, dt);
    c.syncMesh();
  }

  // --- timers -------------------------------------------------------

  private tickTimers(c: Character, dt: number): void {
    if (c.invulnTimer > 0) c.invulnTimer = Math.max(0, c.invulnTimer - dt);
    if (c.hitFlashTimer > 0) c.hitFlashTimer = Math.max(0, c.hitFlashTimer - dt);
    c.attackCooldowns.light = Math.max(0, c.attackCooldowns.light - dt);
    c.attackCooldowns.heavy = Math.max(0, c.attackCooldowns.heavy - dt);
    c.attackCooldowns.special = Math.max(0, c.attackCooldowns.special - dt);
    if (c.dodgeCooldownTimer > 0) c.dodgeCooldownTimer = Math.max(0, c.dodgeCooldownTimer - dt);

    if (c.guardRegenDelay > 0) c.guardRegenDelay = Math.max(0, c.guardRegenDelay - dt);
    if (!c.isGuarding && c.guardRegenDelay <= 0 && c.guardDurability < GameConfig.guard.maxDurability) {
      c.guardDurability = Math.min(
        GameConfig.guard.maxDurability,
        c.guardDurability + GameConfig.guard.regenPerSecond * dt
      );
    }

    if (c.hyperMode) {
      c.hyperModeTimer -= dt;
      if (c.hyperModeTimer <= 0) c.hyperMode = false;
    }

    if (c.hitstunTimer > 0) {
      c.hitstunTimer = Math.max(0, c.hitstunTimer - dt);
      if (c.hitstunTimer <= 0 && c.state === "hitstun") {
        c.state = c.grounded ? "idle" : "fall";
      }
    }

    if (c.state === "guardBreak") {
      c.guardBreakTimer -= dt;
      if (c.guardBreakTimer <= 0) {
        c.state = c.grounded ? "idle" : "fall";
        c.guardDurability = GameConfig.guard.maxDurability * 0.5;
      }
    }
  }

  private tickDodge(c: Character, dt: number): void {
    if (!c.isDodging) return;
    c.dodgeTimer -= dt;
    c.dodgeInvuln = c.dodgeTimer > GameConfig.dodge.duration - GameConfig.dodge.invulnDuration;
    c.velocity.x *= 0.95;
    c.velocity.z *= 0.95;
    if (c.dodgeTimer <= 0) {
      c.isDodging = false;
      c.dodgeInvuln = false;
      c.state = c.grounded ? "idle" : "fall";
    }
  }

  private tickAttackPhase(c: Character, dt: number): void {
    if (c.state !== "attack") return;
    c.attackTimer -= dt;
    if (c.attackTimer > 0) return;

    if (c.attackPhase === "startup") {
      c.attackPhase = "active";
      c.attackTimer = c.currentAttack ? c.currentAttack.activeTime : 0.001;
      if (c.currentAttack) this.spawnSwingEffect(c, c.currentAttack);
    } else if (c.attackPhase === "active") {
      c.attackPhase = "recovery";
      c.attackTimer = c.currentAttack ? c.currentAttack.recovery : 0.001;
    } else if (c.attackPhase === "recovery") {
      c.state = c.grounded ? "idle" : "fall";
      c.attackPhase = null;
      c.currentAttack = null;
    }
  }

  // --- movement / jump / dodge / guard -------------------------------

  private updateMovement(c: Character, intent: CharacterIntent, dt: number): void {
    const moveVec = new THREE.Vector3(intent.moveX, 0, intent.moveZ);
    const mag = Math.min(1, moveVec.length());
    if (mag > 0.0001) moveVec.normalize();

    let speed = c.stats.moveSpeed;
    if (c.hyperMode) speed *= HYPER_MODE_SPEED_MULT;
    if (c.starTimer > 0) speed *= STAR_SPEED_MULT;

    if (intent.wantDash && c.grounded && c.dashStamina > 4 && mag > 0.1) {
      speed *= GameConfig.dash.speedMultiplier;
      c.isDashing = true;
      c.dashStamina = Math.max(0, c.dashStamina - GameConfig.dash.staminaDrainPerSecond * dt);
    } else {
      c.isDashing = false;
      c.dashStamina = Math.min(GameConfig.dash.staminaMax, c.dashStamina + GameConfig.dash.staminaRegenPerSecond * dt);
    }

    const targetX = moveVec.x * speed * mag;
    const targetZ = moveVec.z * speed * mag;
    // Braking needs to be more immediate than acceleration. Using the same
    // damping for both made fighters keep gliding after the stick/key was
    // released, which felt especially slippery during small adjustments.
    const baseLambda = c.grounded
      ? mag > 0.1
        ? GROUND_ACCEL_LAMBDA
        : GROUND_BRAKE_LAMBDA
      : AIR_TURN_LAMBDA;
    const lambda = c.hyperMode ? baseLambda * 0.45 : baseLambda;
    c.velocity.x = damp(c.velocity.x, targetX, lambda, dt);
    c.velocity.z = damp(c.velocity.z, targetZ, lambda, dt);

    c.state = c.grounded ? (mag > 0.1 ? "move" : "idle") : "fall";
  }

  private tryJump(c: Character): void {
    if (c.grounded) {
      c.velocity.y = GameConfig.jump.groundJumpVelocity * c.stats.jumpPower;
      c.grounded = false;
      c.state = "jump";
      this.audio.play("jump");
    } else if (c.airJumpsUsed < GameConfig.jump.maxAirJumps) {
      c.velocity.y = GameConfig.jump.airJumpVelocity * c.stats.jumpPower;
      c.airJumpsUsed++;
      c.state = "jump";
      if (c.hitstunTimer > 0) c.hitstunTimer = 0;
      this.audio.play("jump");
      this.effects.spawnHitSpark(c.position.clone(), 0xbfe6ff, 5);
    }
  }

  private tryDodge(c: Character, intent: CharacterIntent): void {
    const canDodge = c.grounded || !c.airDodgeUsed;
    if (!canDodge) return;

    const moveVec = new THREE.Vector3(intent.moveX, 0, intent.moveZ);
    if (moveVec.lengthSq() < 0.01) {
      moveVec.copy(forwardFromYaw(c.facingAngle)).multiplyScalar(-1);
    } else {
      moveVec.normalize();
    }

    c.isDodging = true;
    c.dodgeTimer = GameConfig.dodge.duration;
    c.dodgeInvuln = true;
    c.dodgeCooldownTimer = c.grounded ? GameConfig.dodge.cooldown : GameConfig.dodge.airCooldown;
    if (!c.grounded) c.airDodgeUsed = true;
    c.dodgeDir.copy(moveVec);
    c.velocity.x = moveVec.x * GameConfig.dodge.speed;
    c.velocity.z = moveVec.z * GameConfig.dodge.speed;
    if (!c.grounded) c.velocity.y = Math.max(c.velocity.y, 3);
    c.state = "dodge";
    c.hitstunTimer = 0;
    c.isGuarding = false;
  }

  private updateGuard(c: Character, intent: CharacterIntent): void {
    if (intent.wantGuard && c.grounded && c.guardDurability > 0 && c.hitstunTimer <= 0) {
      c.isGuarding = true;
      c.state = "guard";
    } else {
      c.isGuarding = false;
      if (c.state === "guard") c.state = c.grounded ? "idle" : "fall";
    }
  }

  // --- attacks --------------------------------------------------------

  private tryAttacks(c: Character, intent: CharacterIntent): void {
    // A held item takes over the light attack — the character's own specials and
    // heavy attack stay available, so picking one up never disarms you.
    if (intent.wantLight && c.heldItem && c.attackCooldowns.light <= 0) {
      this.useItem(c);
      return;
    }
    if (intent.wantSpecial && c.attackCooldowns.special <= 0) {
      this.triggerAttack(c, "special");
    } else if (intent.wantHeavy && c.attackCooldowns.heavy <= 0) {
      this.triggerAttack(c, "heavy");
    } else if (intent.wantLight && c.attackCooldowns.light <= 0) {
      this.triggerAttack(c, "light");
    }
  }

  private useItem(c: Character): void {
    const action = this.items.useHeldItem(c);
    if (!action) return;

    if (action.kind === "attack") {
      c.attackCooldowns.light = action.attack.cooldown;
      this.beginAttack(c, action.attack);
      return;
    }

    // Throwing / firing has no hitbox of its own — the projectile carries it —
    // so the fighter just locks into a short recovery.
    c.attackCooldowns.light = action.recovery;
    c.state = "attack";
    c.currentAttack = null;
    c.attackPhase = "recovery";
    c.attackTimer = action.recovery;
    c.isDashing = false;
  }

  private triggerAttack(c: Character, kind: "light" | "heavy" | "special"): void {
    const def = CHARACTER_ATTACKS[c.def.id][kind];
    c.attackCooldowns[kind] = def.cooldown;

    if (kind === "special") {
      const behavior = SPECIAL_BEHAVIOR[c.def.id];
      if (behavior === "buff") {
        c.hyperMode = true;
        c.hyperModeTimer = HYPER_MODE_DURATION;
        this.audio.play(def.sound);
        this.effects.spawnElectric(c.position.clone().setY(c.position.y + c.height * 0.6), 16);
        c.state = "attack";
        c.currentAttack = null;
        c.attackPhase = "recovery";
        c.attackTimer = def.startup + def.recovery;
        return;
      }
      if (behavior === "mine") {
        this.combat.placeMine(c);
        this.audio.play(def.sound);
        c.state = "attack";
        c.currentAttack = null;
        c.attackPhase = "recovery";
        c.attackTimer = def.startup + def.recovery;
        return;
      }
    }

    this.beginAttack(c, def);
  }

  /** Puts a fighter into the startup/active/recovery pipeline for one attack. */
  private beginAttack(c: Character, def: AttackDef): void {
    c.currentAttack = def;
    c.attackPhase = "startup";
    c.attackTimer = def.startup;
    c.state = "attack";
    c.hitTargetsThisAttack.clear();
    c.isDashing = false;
    this.audio.play(def.sound);
  }

  private spawnSwingEffect(c: Character, attack: AttackDef): void {
    const forward = forwardFromYaw(c.facingAngle);
    const pos = c.position.clone().addScaledVector(forward, attack.range * 0.6);
    pos.y += c.height * 0.55;
    this.effects.spawnHitSpark(pos, 0xffffff, 3);
  }

  // --- physics ----------------------------------------------------------

  private applyPhysics(c: Character, dt: number): void {
    if (!c.grounded) {
      c.velocity.y += GameConfig.gravity * dt;
      c.velocity.y = Math.max(c.velocity.y, -40);
    }

    c.position.x += c.velocity.x * dt;
    c.position.z += c.velocity.z * dt;
    c.position.y += c.velocity.y * dt;

    const groundY = this.stage.getGroundHeightAt(c.position.x, c.position.z, c.position.y);
    if (groundY !== null && c.position.y <= groundY + 0.001 && c.velocity.y <= 0) {
      c.position.y = groundY;
      c.velocity.y = 0;
      if (!c.grounded) {
        c.grounded = true;
        c.airJumpsUsed = 0;
        c.airDodgeUsed = false;
        if (c.state === "fall" || c.state === "jump") c.state = "idle";
      }
    } else if (groundY === null || c.position.y > groundY + 0.001) {
      if (c.grounded) {
        c.grounded = false;
        if (c.state === "idle" || c.state === "move") c.state = "fall";
      }
    }
  }

  // --- animation ----------------------------------------------------------

  private updateAnimation(c: Character, dt: number): void {
    c.animTime += dt;
    const speed = Math.hypot(c.velocity.x, c.velocity.z);
    const moving = c.grounded && speed > 0.4;
    const bob = moving ? Math.sin(c.animTime * 11) * 0.14 : 0;
    c.parts.rightLeg.rotation.x = bob;
    c.parts.leftLeg.rotation.x = -bob;

    if (c.state === "attack" && c.attackPhase && c.currentAttack) {
      const startupT = c.attackPhase === "startup" ? 1 - c.attackTimer / Math.max(0.001, c.currentAttack.startup) : 1;
      const swing =
        c.attackPhase === "startup" ? -0.7 * startupT : c.attackPhase === "active" ? 1.4 : 0.5;
      c.parts.rightArm.rotation.x = -swing;
      c.parts.leftArm.rotation.x = swing * 0.3;
    } else if (c.isGuarding) {
      c.parts.rightArm.rotation.x = -1.2;
      c.parts.leftArm.rotation.x = -1.2;
    } else {
      const armSwing = moving ? Math.sin(c.animTime * 11 + Math.PI) * 0.22 : 0;
      c.parts.rightArm.rotation.x = THREE.MathUtils.lerp(c.parts.rightArm.rotation.x, armSwing, 0.25);
      c.parts.leftArm.rotation.x = THREE.MathUtils.lerp(c.parts.leftArm.rotation.x, -armSwing, 0.25);
    }

    if (c.hitFlashTimer > 0) {
      const k = c.hitFlashTimer / 0.15;
      c.group.scale.set(1 + 0.15 * k, 1 - 0.18 * k, 1 + 0.15 * k);
    } else {
      c.group.scale.set(1, 1, 1);
    }
  }
}
