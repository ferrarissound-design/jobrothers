import * as THREE from "three";
import type { Character } from "../characters/Character";
import type { AttackDef } from "../characters/attacks";
import { forwardFromYaw, isInFrontCone, horizontalDistance } from "./Hitbox";
import { computeKnockback } from "./KnockbackSystem";
import { GameConfig } from "../config/gameConfig";
import { clamp } from "../utils/math";
import type { EffectManager } from "../core/EffectManager";
import type { AudioManager } from "../core/AudioManager";
import {
  MINE_ARM_DELAY,
  MINE_LIFETIME,
  MINE_MAX_ACTIVE,
  MINE_PLACE_DISTANCE,
  MINE_TRIGGER_RADIUS,
  HYPER_MODE_ATTACK_MULT,
} from "../characters/abilities";

export interface DestructibleLike {
  id: string;
  position: THREE.Vector3;
  radius: number;
  destroyed: boolean;
  isExplosive: boolean;
  takeHit(damage: number, impactPower?: number): void;
}

export interface CombatCallbacks {
  onHitStop: (duration: number) => void;
  onCameraShake: (amount: number) => void;
}

interface Mine {
  id: number;
  ownerId: string;
  position: THREE.Vector3;
  armTimer: number;
  life: number;
  mesh: THREE.Group;
}

export class CombatSystem {
  private scene: THREE.Scene;
  private effects: EffectManager;
  private audio: AudioManager;
  private callbacks: CombatCallbacks;
  private mines: Mine[] = [];
  private mineIdCounter = 0;

  constructor(scene: THREE.Scene, effects: EffectManager, audio: AudioManager, callbacks: CombatCallbacks) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.callbacks = callbacks;
  }

  /** Main per-frame entry point: resolves active attack hitboxes against fighters and obstacles, and ticks mines. */
  update(dt: number, characters: Character[], obstacles: DestructibleLike[]): void {
    this.processAttacks(characters, obstacles);
    this.updateMines(dt, characters);
  }

  private processAttacks(characters: Character[], obstacles: DestructibleLike[]): void {
    for (const attacker of characters) {
      if (!attacker.alive || attacker.attackPhase !== "active" || !attacker.currentAttack) continue;
      const attack = attacker.currentAttack;

      for (const defender of characters) {
        if (defender === attacker || !defender.alive) continue;
        if (attacker.hitTargetsThisAttack.has(defender.instanceId)) continue;
        if (
          !isInFrontCone(
            attacker.position,
            attacker.facingAngle,
            defender.position,
            attack.range,
            attack.angle,
            attacker.radius,
            defender.radius
          )
        ) {
          continue;
        }
        this.applyHit(attacker, defender, attack);
      }

      for (const obstacle of obstacles) {
        if (obstacle.destroyed) continue;
        if (attacker.hitTargetsThisAttack.has(obstacle.id)) continue;
        if (
          !isInFrontCone(
            attacker.position,
            attacker.facingAngle,
            obstacle.position,
            attack.range,
            attack.angle,
            attacker.radius,
            obstacle.radius
          )
        ) {
          continue;
        }
        attacker.hitTargetsThisAttack.add(obstacle.id);
        obstacle.takeHit(attack.damage * attacker.stats.attackPower, attack.knockbackBase * attacker.stats.knockbackPower);
      }
    }
  }

  private applyHit(attacker: Character, defender: Character, attack: AttackDef): void {
    attacker.hitTargetsThisAttack.add(defender.instanceId);
    if (defender.invulnTimer > 0) return;
    if (defender.isDodging && defender.dodgeInvuln) return;

    const dirToDefender = new THREE.Vector3().subVectors(defender.position, attacker.position);

    if (defender.isGuarding && defender.state === "guard") {
      const facingDefender = forwardFromYaw(defender.facingAngle);
      const toAttacker = new THREE.Vector3().subVectors(attacker.position, defender.position);
      toAttacker.y = 0;
      toAttacker.normalize();
      const facing2 = new THREE.Vector3(facingDefender.x, 0, facingDefender.z).normalize();
      if (facing2.dot(toAttacker) > 0.15) {
        this.applyGuardedHit(attacker, defender, attack, dirToDefender);
        return;
      }
    }

    const hyperMul = attacker.hyperMode ? HYPER_MODE_ATTACK_MULT : 1;
    const finalDamage = attack.damage * attacker.stats.attackPower * hyperMul * defender.stats.defense;
    defender.takeDamage(finalDamage);
    const { velocity, hitstun } = computeKnockback(attack, attacker, defender, dirToDefender);
    defender.velocity.copy(velocity);
    defender.hitstunTimer = hitstun;
    defender.state = "hitstun";
    defender.grounded = false;
    defender.hitFlashTimer = 0.15;
    defender.isGuarding = false;

    const hitPos = defender.position.clone();
    hitPos.y += defender.height * 0.55;
    this.spawnHitEffect(attack, hitPos);
    this.audio.play(attack.sound);
    this.callbacks.onHitStop(clamp(0.02 + finalDamage * 0.0028, 0.02, 0.12));
    this.callbacks.onCameraShake(clamp(finalDamage / 45, 0.05, 1));
  }

  private applyGuardedHit(attacker: Character, defender: Character, attack: AttackDef, dirToDefender: THREE.Vector3): void {
    const cfg = GameConfig.guard;
    defender.takeDamage(attack.damage * cfg.chipDamageRatio);
    defender.guardDurability -= attack.guardBreakAmount;
    defender.guardRegenDelay = cfg.regenDelay;

    const { velocity } = computeKnockback(attack, attacker, defender, dirToDefender);
    velocity.multiplyScalar(cfg.knockbackReduction);
    defender.velocity.add(velocity);

    this.audio.play("guard");
    this.effects.spawnHitSpark(defender.position.clone().setY(defender.position.y + 1), 0x9fd8ff, 5);

    if (defender.guardDurability <= 0) {
      defender.guardDurability = 0;
      defender.isGuarding = false;
      defender.state = "guardBreak";
      defender.guardBreakTimer = cfg.breakStunDuration;
    }
  }

  private spawnHitEffect(attack: AttackDef, pos: THREE.Vector3): void {
    switch (attack.effect) {
      case "spark":
        this.effects.spawnHitSpark(pos, 0xffe066, 7);
        break;
      case "impact":
        this.effects.spawnHitSpark(pos, 0xffffff, 10);
        break;
      case "electric":
        this.effects.spawnElectric(pos, 12);
        break;
      case "explosion":
        this.effects.spawnExplosion(pos);
        break;
      case "shockwave":
        this.effects.spawnShockwave(pos, 0xffcc66, 2);
        this.effects.spawnHitSpark(pos, 0xffcc66, 10);
        break;
    }
  }

  /** Applies radial damage/knockback, used by mines and exploding drums. */
  applyExplosionDamage(
    position: THREE.Vector3,
    radius: number,
    damage: number,
    knockbackBase: number,
    characters: Character[],
    excludeId?: string
  ): void {
    for (const c of characters) {
      if (!c.alive || c.instanceId === excludeId) continue;
      const dist = horizontalDistance(position, c.position);
      if (dist > radius) continue;
      if (c.invulnTimer > 0 || (c.isDodging && c.dodgeInvuln)) continue;
      const falloff = 1 - dist / radius;
      const dmg = damage * (0.5 + 0.5 * falloff);
      c.takeDamage(dmg);
      const dir = new THREE.Vector3().subVectors(c.position, position);
      if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      dir.y = 0;
      dir.normalize();
      const fakeAttack: AttackDef = {
        id: "explosion",
        name: "explosion",
        damage: 0,
        knockbackBase: knockbackBase * (0.6 + 0.4 * falloff),
        knockbackScale: 0.4,
        range: 999,
        angle: Math.PI,
        startup: 0,
        activeTime: 0,
        recovery: 0,
        cooldown: 0,
        hitStun: 0.5,
        direction: "upward",
        effect: "explosion",
        sound: "explosion",
        guardBreakAmount: 0,
      };
      const fakeAttacker = { stats: { knockbackPower: 1 } } as unknown as Character;
      const { velocity, hitstun } = computeKnockback(fakeAttack, fakeAttacker, c, dir);
      c.velocity.copy(velocity);
      c.hitstunTimer = hitstun;
      c.state = "hitstun";
      c.grounded = false;
      c.isGuarding = false;
      c.hitFlashTimer = 0.15;
    }
    this.effects.spawnExplosion(position);
    this.audio.play("explosion");
    this.callbacks.onHitStop(0.08);
    this.callbacks.onCameraShake(0.7);
  }

  placeMine(owner: Character): void {
    const ownerMines = this.mines.filter((m) => m.ownerId === owner.instanceId);
    if (ownerMines.length >= MINE_MAX_ACTIVE) {
      const oldest = ownerMines[0];
      this.removeMine(oldest);
    }
    const forward = forwardFromYaw(owner.facingAngle);
    const pos = owner.position.clone().addScaledVector(forward, MINE_PLACE_DISTANCE);
    pos.y = owner.position.y + 0.05;

    const mesh = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.34, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6 })
    );
    const light = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1 })
    );
    light.position.y = 0.1;
    mesh.add(base, light);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    this.mines.push({
      id: this.mineIdCounter++,
      ownerId: owner.instanceId,
      position: pos,
      armTimer: MINE_ARM_DELAY,
      life: MINE_LIFETIME,
      mesh,
    });
  }

  private removeMine(mine: Mine): void {
    this.scene.remove(mine.mesh);
    mine.mesh.traverse((obj) => {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else mat?.dispose();
    });
    const idx = this.mines.indexOf(mine);
    if (idx >= 0) this.mines.splice(idx, 1);
  }

  private updateMines(dt: number, characters: Character[]): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      mine.armTimer -= dt;
      mine.life -= dt;
      mine.mesh.rotation.y += dt * 2;
      const blink = (mine.mesh.children[1] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      blink.emissiveIntensity = 0.5 + Math.sin(performance.now() * 0.01) * 0.5;

      if (mine.life <= 0) {
        this.removeMine(mine);
        continue;
      }
      if (mine.armTimer > 0) continue;

      let triggered = false;
      for (const c of characters) {
        if (!c.alive) continue;
        if (horizontalDistance(mine.position, c.position) <= MINE_TRIGGER_RADIUS) {
          triggered = true;
          break;
        }
      }
      if (triggered) {
        this.applyExplosionDamage(mine.position, MINE_TRIGGER_RADIUS * 1.6, 17, 13, characters);
        this.removeMine(mine);
      }
    }
  }

  get mineCount(): number {
    return this.mines.length;
  }

  dispose(): void {
    [...this.mines].forEach((m) => this.removeMine(m));
  }
}
