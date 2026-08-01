import * as THREE from "three";
import type { Character } from "../characters/Character";
import type { AttackDef } from "../characters/attacks";
import type { Stage } from "../stage/Stage";
import type { CombatSystem, DestructibleLike } from "../combat/CombatSystem";
import type { EffectManager } from "../core/EffectManager";
import type { AudioManager } from "../core/AudioManager";
import { forwardFromYaw, horizontalDistance } from "../combat/Hitbox";
import { GameConfig, type ItemFrequency } from "../config/gameConfig";
import { disposeObject3D } from "../utils/dispose";
import { createItemMesh } from "./itemMeshFactory";
import { ITEMS, ITEM_SPAWN_WEIGHTS, ITEM_ORDER, type ItemDef, type ItemId, type ProjectileDef } from "./itemData";

/** A pickup lying on (or falling towards) the stage. */
interface FieldItem {
  id: number;
  def: ItemDef;
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  grounded: boolean;
  life: number;
  spin: number;
}

interface Projectile {
  owner: Character;
  def: ProjectileDef;
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  /** Direct-hit projectiles carry the attack that resolves on contact. */
  attack: AttackDef;
}

/** What the controller should do after the attack button was pressed with an item in hand. */
export type ItemAction =
  | { kind: "attack"; attack: AttackDef }
  | { kind: "instant"; recovery: number }
  | null;

/** Minimal view of a pickup, handed to the CPU so it can decide to go and grab it. */
export interface ItemTarget {
  id: number;
  position: THREE.Vector3;
  /** true while the item is still falling — worth walking under, not standing on. */
  falling: boolean;
}

/**
 * Owns everything item-related: the spawn timer, the pickups lying on the
 * stage, whatever each fighter is carrying, and the projectiles thrown or
 * fired out of those items.
 *
 * Fighters never reach for an item themselves — walking into one picks it up.
 * That keeps items on the existing control scheme (no grab button to find room
 * for on a phone) and means the CPU needs no new input either: it just steers
 * at the pickup like it steers at anything else.
 */
export class ItemManager {
  private items: FieldItem[] = [];
  private projectiles: Projectile[] = [];
  private idCounter = 0;
  private spawnTimer = 0;
  private frequency: ItemFrequency;

  constructor(
    private scene: THREE.Scene,
    private stage: Stage,
    private effects: EffectManager,
    private audio: AudioManager,
    private combat: CombatSystem,
    frequency: ItemFrequency
  ) {
    this.frequency = frequency;
    this.spawnTimer = this.nextSpawnDelay();
  }

  setFrequency(frequency: ItemFrequency): void {
    this.frequency = frequency;
    this.spawnTimer = Math.min(this.spawnTimer, this.nextSpawnDelay());
  }

  get activeCount(): number {
    return this.items.length;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  /** Pickups the CPU may want to walk into. Held items and projectiles are not targets. */
  itemTargets(): ItemTarget[] {
    return this.items.map((i) => ({ id: i.id, position: i.position, falling: !i.grounded }));
  }

  update(dt: number, characters: Character[], obstacles: DestructibleLike[]): void {
    this.tickSpawner(dt);
    this.tickItems(dt);
    this.tickHeldItems(dt, characters);
    this.tickPickups(characters);
    this.tickProjectiles(dt, characters, obstacles);
  }

  // --- spawning ---------------------------------------------------------

  private nextSpawnDelay(): number {
    const base = GameConfig.items.interval[this.frequency];
    if (base <= 0) return Infinity;
    return base * (0.7 + Math.random() * 0.6);
  }

  private tickSpawner(dt: number): void {
    if (GameConfig.items.interval[this.frequency] <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.nextSpawnDelay();
    if (this.items.length >= GameConfig.items.maxActive) return;
    this.spawnRandomItem();
  }

  private spawnRandomItem(): void {
    const def = ITEMS[this.rollItemId()];
    const spot = this.findSpawnSpot();
    if (!spot) return;

    const mesh = createItemMesh(def);
    mesh.position.set(spot.x, GameConfig.items.spawnHeight, spot.z);
    this.scene.add(mesh);

    this.items.push({
      id: this.idCounter++,
      def,
      mesh,
      position: mesh.position.clone(),
      velocity: new THREE.Vector3(0, 0, 0),
      grounded: false,
      life: GameConfig.items.lifetime,
      spin: Math.random() * Math.PI * 2,
    });
  }

  private rollItemId(): ItemId {
    let total = 0;
    for (const id of ITEM_ORDER) total += ITEM_SPAWN_WEIGHTS[id];
    let roll = Math.random() * total;
    for (const id of ITEM_ORDER) {
      roll -= ITEM_SPAWN_WEIGHTS[id];
      if (roll <= 0) return id;
    }
    return ITEM_ORDER[0];
  }

  /**
   * Items are dropped over solid floor only. Falling straight into the void
   * the instant it spawns is not a fun surprise, it just looks broken.
   */
  private findSpawnSpot(): { x: number; z: number } | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * this.stage.arenaRadius * 0.72;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (this.stage.isOverVoid(x, z)) continue;
      return { x, z };
    }
    return null;
  }

  // --- field items ------------------------------------------------------

  private tickItems(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;

      if (!item.grounded) {
        item.velocity.y += GameConfig.gravity * dt;
        item.position.addScaledVector(item.velocity, dt);
        const groundY = this.stage.getGroundHeightAt(item.position.x, item.position.z, item.position.y);
        if (groundY !== null && item.position.y <= groundY + GameConfig.items.restHeight) {
          item.position.y = groundY + GameConfig.items.restHeight;
          // One soft bounce, then it settles — enough to read as a physical
          // object landing without it skittering away from where it dropped.
          if (item.velocity.y < -6) {
            item.velocity.y *= -0.32;
          } else {
            item.velocity.set(0, 0, 0);
            item.grounded = true;
            this.effects.spawnHitSpark(item.position.clone(), item.def.color, 4);
          }
        }
      }

      item.spin += dt * 1.6;
      item.mesh.position.copy(item.position);
      item.mesh.position.y += item.grounded ? Math.sin(item.spin * 1.4) * 0.07 : 0;
      item.mesh.rotation.y = item.spin;

      // Blink out the last seconds so a pickup never vanishes without warning.
      const fading = item.life < GameConfig.items.blinkTime;
      item.mesh.visible = !fading || Math.sin(item.life * 22) > -0.2;

      if (item.life <= 0 || item.position.y < GameConfig.fallDeathY) {
        this.removeItem(i);
      }
    }
  }

  private removeItem(index: number): void {
    const item = this.items[index];
    disposeObject3D(item.mesh);
    this.items.splice(index, 1);
  }

  // --- pickup / hold ----------------------------------------------------

  private tickPickups(characters: Character[]): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      for (const c of characters) {
        if (!c.alive || c.state === "dead") continue;
        // An instant item is consumed by anyone who touches it; a held item
        // needs a free hand, so a fighter mid-item cannot hoard the field.
        if (item.def.use !== "instant" && c.heldItem) continue;
        if (horizontalDistance(item.position, c.position) > c.radius + GameConfig.items.pickupRadius) continue;
        if (Math.abs(item.position.y - (c.position.y + c.height * 0.4)) > c.height * 0.9) continue;

        this.grant(c, item.def);
        this.removeItem(i);
        break;
      }
    }
  }

  private grant(c: Character, def: ItemDef): void {
    this.audio.play("pickup");
    this.effects.spawnHitSpark(c.position.clone().setY(c.position.y + c.height * 0.6), def.color, 10);

    if (def.use === "instant") {
      this.applyInstant(c, def);
      return;
    }

    const mesh = createItemMesh(def);
    this.attachToHand(c, mesh, def);
    c.heldItem = { def, usesLeft: def.uses, timeLeft: def.holdTime, mesh };
  }

  private applyInstant(c: Character, def: ItemDef): void {
    const effect = def.instant;
    if (!effect) return;
    if (effect.heal) {
      c.damagePercent = Math.max(0, c.damagePercent - effect.heal);
      this.effects.spawnHitSpark(c.position.clone().setY(c.position.y + c.height * 0.7), 0x6cc24a, 12);
    }
    if (effect.invuln) {
      c.starTimer = effect.invuln;
      c.invulnTimer = Math.max(c.invulnTimer, effect.invuln);
      this.effects.spawnShockwave(c.position.clone(), def.color, 2.6);
    }
  }

  /**
   * Parents the model to the wrist joint the limb animation already drives, so
   * a held item swings with the arm instead of needing its own animation.
   */
  private attachToHand(c: Character, mesh: THREE.Group, def: ItemDef): void {
    const scale = c.height / 1.75;
    mesh.scale.setScalar(scale);
    switch (def.use) {
      case "melee":
        mesh.position.set(0, -0.12 * scale, 0.05 * scale);
        mesh.rotation.set(-0.4, 0, 0);
        break;
      case "shoot":
        mesh.position.set(0, -0.1 * scale, 0.16 * scale);
        mesh.rotation.set(1.2, 0, 0);
        break;
      default:
        mesh.position.set(0, -0.16 * scale, 0.08 * scale);
        mesh.rotation.set(0, 0, 0);
    }
    c.parts.rightHand.add(mesh);
  }

  private tickHeldItems(dt: number, characters: Character[]): void {
    for (const c of characters) {
      if (c.starTimer > 0) {
        c.starTimer = Math.max(0, c.starTimer - dt);
        if (c.starTimer > 0 && Math.random() < 0.35) {
          this.effects.spawnHitSpark(
            c.position.clone().setY(c.position.y + c.height * Math.random()),
            0xffd54f,
            2
          );
        }
      }

      const held = c.heldItem;
      if (!held) continue;
      if (!c.alive) {
        this.releaseHeldItem(c);
        continue;
      }
      // Every holdable item carries a timer (instant items are never held), so
      // a fighter who grabs a weapon and runs away still has to come back for
      // the next one.
      held.timeLeft -= dt;
      if (held.timeLeft <= 0) this.releaseHeldItem(c);
    }
  }

  /** Destroys whatever the fighter is carrying (spent, timed out, or lost a stock). */
  releaseHeldItem(c: Character): void {
    const held = c.heldItem;
    if (!held) return;
    this.effects.spawnSmoke(c.position.clone().setY(c.position.y + c.height * 0.5), 4);
    disposeObject3D(held.mesh);
    c.heldItem = null;
  }

  // --- using an item ----------------------------------------------------

  /**
   * Resolves an attack-button press for a fighter holding an item. Melee items
   * hand an AttackDef back to the controller so they run through the normal
   * hitbox pipeline; throw/shoot items are launched here and only report how
   * long the fighter should be busy for.
   */
  useHeldItem(c: Character): ItemAction {
    const held = c.heldItem;
    if (!held) return null;

    switch (held.def.use) {
      case "melee": {
        const attack = held.def.attack;
        if (!attack) return null;
        held.usesLeft -= 1;
        if (held.usesLeft <= 0) {
          // Kept in hand for exactly as long as the swing that spent it, so the
          // final hit is not delivered by an empty fist.
          held.timeLeft = Math.min(held.timeLeft, attack.startup + attack.activeTime + attack.recovery);
        }
        return { kind: "attack", attack };
      }
      case "throw":
      case "shoot": {
        const projectile = held.def.projectile;
        if (!projectile) return null;
        this.launch(c, projectile, held.def);
        held.usesLeft -= 1;
        if (held.usesLeft <= 0) this.releaseHeldItem(c);
        return { kind: "instant", recovery: held.def.use === "throw" ? 0.3 : 0.16 };
      }
      default:
        return null;
    }
  }

  private launch(c: Character, def: ProjectileDef, item: ItemDef): void {
    const forward = forwardFromYaw(c.facingAngle);
    const mesh = createItemMesh(item);
    mesh.scale.setScalar(item.use === "shoot" ? 0.55 : 0.9);

    const position = c.position
      .clone()
      .addScaledVector(forward, c.radius + def.radius + 0.25)
      .setY(c.position.y + c.height * 0.62);
    mesh.position.copy(position);
    this.scene.add(mesh);

    const velocity = forward.clone().multiplyScalar(def.speed);
    velocity.y = def.upwardSpeed;
    // Inherit the thrower's momentum, so throwing while running forward does
    // not leave the bomb behind you.
    velocity.x += c.velocity.x * 0.35;
    velocity.z += c.velocity.z * 0.35;

    this.projectiles.push({
      owner: c,
      def,
      mesh,
      position,
      velocity,
      life: def.life,
      attack: projectileAttack(item.id, def),
    });

    this.audio.play(item.use === "throw" ? "heavyAttack" : "blaster");
  }

  // --- projectiles ------------------------------------------------------

  private tickProjectiles(dt: number, characters: Character[], obstacles: DestructibleLike[]): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.velocity.y += GameConfig.gravity * p.def.gravityScale * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 5;

      let hit: Character | null = null;
      for (const c of characters) {
        if (!c.alive || c === p.owner) continue;
        if (horizontalDistance(p.position, c.position) > c.radius + p.def.radius) continue;
        if (p.position.y < c.position.y - p.def.radius || p.position.y > c.position.y + c.height) continue;
        hit = c;
        break;
      }

      let hitObstacle: DestructibleLike | null = null;
      if (!hit) {
        for (const obs of obstacles) {
          if (obs.destroyed) continue;
          if (horizontalDistance(p.position, obs.position) > obs.radius + p.def.radius) continue;
          if (Math.abs(p.position.y - obs.position.y) > 1.6) continue;
          hitObstacle = obs;
          break;
        }
      }

      const groundY = this.stage.getGroundHeightAt(p.position.x, p.position.z, p.position.y);
      const hitGround = groundY !== null && p.position.y <= groundY + p.def.radius;
      // getGroundHeightAt only reports a platform once the projectile is at (or
      // above) its top surface, so a shot flying below that — through the solid
      // side of the box — would otherwise sail straight through it.
      const hitPlatformSide = !hitGround && this.stage.hitsPlatformSide(p.position, p.def.radius);
      const expired = p.life <= 0 || p.position.y < GameConfig.fallDeathY;

      if (!hit && !hitObstacle && !hitGround && !hitPlatformSide && !expired) continue;

      this.detonate(p, hit, hitObstacle, characters, hitGround || hitPlatformSide || expired);
      disposeObject3D(p.mesh);
      this.projectiles.splice(i, 1);
    }
  }

  private detonate(
    p: Projectile,
    hit: Character | null,
    hitObstacle: DestructibleLike | null,
    characters: Character[],
    surfaceOnly: boolean
  ): void {
    if (p.def.explosionRadius > 0) {
      // A thrown explosive hurts its owner too, exactly like the mine trap —
      // throwing a bomb at your own feet should not be free.
      this.combat.applyExplosionDamage(
        p.position.clone(),
        p.def.explosionRadius,
        p.def.damage,
        p.def.knockbackBase,
        characters
      );
      hitObstacle?.takeHit(p.def.damage, p.def.knockbackBase);
      return;
    }

    if (hit) {
      this.combat.applyProjectileHit(p.owner, hit, p.attack, p.position.clone());
      return;
    }
    if (hitObstacle) {
      hitObstacle.takeHit(p.def.damage, p.def.knockbackBase);
    }
    if (surfaceOnly || hitObstacle) {
      this.effects.spawnHitSpark(p.position.clone(), p.def.color, 5);
    }
  }

  // --- lifecycle --------------------------------------------------------

  /** Clears the field, every held item and every projectile — used on restart. */
  reset(characters: Character[]): void {
    while (this.items.length) this.removeItem(this.items.length - 1);
    for (const p of this.projectiles) disposeObject3D(p.mesh);
    this.projectiles = [];
    for (const c of characters) {
      if (c.heldItem) {
        disposeObject3D(c.heldItem.mesh);
        c.heldItem = null;
      }
      c.starTimer = 0;
    }
    this.spawnTimer = this.nextSpawnDelay();
  }
}

/** Builds the one-off AttackDef a direct-hit projectile resolves with. */
function projectileAttack(id: ItemId, def: ProjectileDef): AttackDef {
  return {
    id: `item_${id}_shot`,
    name: id,
    damage: def.damage,
    knockbackBase: def.knockbackBase,
    knockbackScale: 0.3,
    range: def.radius,
    angle: Math.PI,
    startup: 0,
    activeTime: 0,
    recovery: 0,
    cooldown: 0,
    hitStun: 0.22,
    direction: "horizontal",
    effect: "spark",
    sound: "hit",
    guardBreakAmount: 8,
  };
}
