import * as THREE from "three";
import type { CharacterDef, CharacterStats } from "./characterData";
import { createCharacterMesh, type CharacterParts } from "./characterMeshFactory";
import type { AttackDef } from "./attacks";
import { GameConfig } from "../config/gameConfig";

export type CharacterState =
  | "idle"
  | "move"
  | "jump"
  | "fall"
  | "attack"
  | "hitstun"
  | "guard"
  | "guardBreak"
  | "dodge"
  | "dead";

export type AttackPhase = "startup" | "active" | "recovery" | null;

export interface FighterLabel {
  instanceId: string; // "player" | "cpu1" | "cpu2" | "cpu3"
  displayName: string;
  isPlayer: boolean;
}

/**
 * Runtime fighter: owns the Three.js mesh, physics state and combat state.
 * Behavior (input -> state transitions) lives in CharacterController so the
 * same class works for both the human player and CPU-controlled fighters.
 */
export class Character {
  readonly instanceId: string;
  readonly displayName: string;
  readonly isPlayer: boolean;
  readonly def: CharacterDef;
  stats: CharacterStats;

  group: THREE.Group;
  parts: CharacterParts;

  position: THREE.Vector3;
  velocity = new THREE.Vector3();
  facingAngle = 0; // yaw, radians
  grounded = true;

  state: CharacterState = "idle";
  damagePercent = 0;
  stocks = GameConfig.initialStocks;
  alive = true;

  hitstunTimer = 0;
  invulnTimer = 0; // respawn / dodge invulnerability
  respawning = false;

  isGuarding = false;
  guardDurability = GameConfig.guard.maxDurability;
  guardBreakTimer = 0;
  guardRegenDelay = 0;

  isDodging = false;
  dodgeTimer = 0;
  dodgeCooldownTimer = 0;
  dodgeInvuln = false;
  dodgeDir = new THREE.Vector3();

  airJumpsUsed = 0;
  airDodgeUsed = false;

  isDashing = false;
  dashStamina = GameConfig.dash.staminaMax;

  currentAttack: AttackDef | null = null;
  attackPhase: AttackPhase = null;
  attackTimer = 0;
  attackCooldowns: { light: number; heavy: number; special: number } = { light: 0, heavy: 0, special: 0 };
  hitTargetsThisAttack = new Set<string>();
  attackAnimT = 0;

  hyperMode = false; // hayasugi special
  hyperModeTimer = 0;
  paralyzedTimer = 0;

  animTime = 0;
  hitFlashTimer = 0;
  squash = 1;

  constructor(label: FighterLabel, def: CharacterDef, spawnPos: THREE.Vector3) {
    this.instanceId = label.instanceId;
    this.displayName = label.displayName;
    this.isPlayer = label.isPlayer;
    this.def = def;
    this.stats = { ...def.stats };

    this.parts = createCharacterMesh(def);
    this.group = this.parts.root;
    this.position = spawnPos.clone();
    this.group.position.copy(this.position);
  }

  get radius(): number {
    return this.stats.radius;
  }

  get height(): number {
    return this.stats.height;
  }

  takeDamage(amount: number): void {
    this.damagePercent = Math.max(0, this.damagePercent + amount);
  }

  resetForRespawn(spawnPos: THREE.Vector3): void {
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.damagePercent = 0;
    this.grounded = false;
    this.state = "fall";
    this.invulnTimer = GameConfig.respawnInvulnDuration;
    this.respawning = false;
    this.airJumpsUsed = 0;
    this.airDodgeUsed = false;
    this.hitstunTimer = 0;
    this.hitFlashTimer = 0;
    this.isGuarding = false;
    this.guardDurability = GameConfig.guard.maxDurability;
    this.guardBreakTimer = 0;
    this.guardRegenDelay = 0;
    this.isDodging = false;
    this.dodgeTimer = 0;
    this.dodgeCooldownTimer = 0;
    this.dodgeInvuln = false;
    this.isDashing = false;
    this.dashStamina = GameConfig.dash.staminaMax;
    this.currentAttack = null;
    this.attackPhase = null;
    this.attackTimer = 0;
    this.hitTargetsThisAttack.clear();
    this.hyperMode = false;
    this.hyperModeTimer = 0;
    this.paralyzedTimer = 0;
    this.group.scale.set(1, 1, 1);
    this.syncMesh();
  }

  /** Restores all stock- and match-scoped state for a completely new match. */
  resetForNewMatch(spawnPos: THREE.Vector3): void {
    this.stocks = GameConfig.initialStocks;
    this.alive = true;
    this.group.visible = true;
    this.resetForRespawn(spawnPos);
    this.attackCooldowns.light = 0;
    this.attackCooldowns.heavy = 0;
    this.attackCooldowns.special = 0;
  }

  loseStock(): boolean {
    this.stocks -= 1;
    return this.stocks <= 0;
  }

  syncMesh(): void {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.facingAngle;
  }
}
