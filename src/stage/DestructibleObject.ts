import * as THREE from "three";
import type { DestructibleLike } from "../combat/CombatSystem";
import type { EffectManager } from "../core/EffectManager";
import { disposeObject3D } from "../utils/dispose";
import { addOutlines, tagInk, toonMaterial, type Ramp } from "../render/celShading";

export type DestructibleType = "crate" | "drum" | "wall" | "sign" | "vending";

let idCounter = 0;

export interface DestructibleOptions {
  type: DestructibleType;
  position: THREE.Vector3;
  rotationY?: number;
  hp?: number;
  onExplode?: (position: THREE.Vector3) => void;
}

/**
 * A breakable stage prop. Attacks and fast knockback collisions chip its HP;
 * at zero it spawns a capped burst of fragments and is removed. Drums are
 * flagged explosive and, on a strong hit, detonate instead of just breaking.
 */
export class DestructibleObject implements DestructibleLike {
  readonly id: string;
  readonly type: DestructibleType;
  position: THREE.Vector3;
  radius: number;
  destroyed = false;
  isExplosive: boolean;
  group: THREE.Group;

  private hp: number;
  private maxHp: number;
  private effects: EffectManager;
  private scene: THREE.Scene;
  private debrisColor: number;
  private onExplode?: (position: THREE.Vector3) => void;
  private explosionArmed = false;
  private flashTimeoutIds: ReturnType<typeof setTimeout>[] = [];

  constructor(scene: THREE.Scene, effects: EffectManager, opts: DestructibleOptions) {
    this.id = `dstr_${idCounter++}`;
    this.type = opts.type;
    this.position = opts.position.clone();
    this.scene = scene;
    this.effects = effects;
    this.onExplode = opts.onExplode;
    this.isExplosive = opts.type === "drum";

    const built = buildDestructibleMesh(opts.type);
    this.group = built.group;
    this.radius = built.radius;
    this.debrisColor = built.color;
    this.maxHp = opts.hp ?? built.defaultHp;
    this.hp = this.maxHp;

    this.group.position.copy(this.position);
    this.group.rotation.y = opts.rotationY ?? Math.random() * Math.PI * 2;
    this.scene.add(this.group);
  }

  /** impactPower represents the force behind the hit (roughly knockback strength); used to decide drum detonation. */
  takeHit(damage: number, impactPower = damage): void {
    if (this.destroyed) return;
    this.hp -= damage;

    if (this.isExplosive && impactPower >= 9 && !this.explosionArmed) {
      this.explosionArmed = true;
      this.destroy(true);
      return;
    }

    this.flashHit();
    if (this.hp <= 0) this.destroy(false);
  }

  private flashHit(): void {
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshToonMaterial;
      if (mat?.emissive) {
        mat.emissive.setHex(0x442200);
        // Tracked so destroy() can cancel it: a hit landing just before the prop
        // breaks would otherwise still fire this after the material — and the
        // group it belongs to — has already been torn down.
        this.flashTimeoutIds.push(setTimeout(() => mat.emissive?.setHex(0x000000), 90));
      }
    });
  }

  private destroy(exploded: boolean): void {
    this.destroyed = true;
    for (const id of this.flashTimeoutIds) clearTimeout(id);
    this.flashTimeoutIds.length = 0;
    const worldPos = this.position.clone();
    worldPos.y += 0.3;
    this.effects.spawnFragments(worldPos, this.debrisColor, exploded ? 16 : 10);
    if (exploded) {
      this.onExplode?.(this.position.clone());
    }
    disposeObject3D(this.group);
  }
}

interface BuiltMesh {
  group: THREE.Group;
  radius: number;
  color: number;
  defaultHp: number;
}

/**
 * One material per prop rather than a shared cache: `flashHit` tints the
 * material's emissive on impact, and a shared one would flash every crate in
 * the arena at once.
 */
function mat(color: number, ramp: Ramp = "matte"): THREE.MeshToonMaterial {
  return toonMaterial(ramp, { color });
}

/** Ink line for props fought over at close range, in world units. */
const PROP_INK = 0.016;

function buildDestructibleMesh(type: DestructibleType): BuiltMesh {
  const group = new THREE.Group();
  switch (type) {
    case "crate": {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat(0xa5723a));
      m.position.y = 0.45;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return ink({ group, radius: 0.65, color: 0xa5723a, defaultHp: 16 });
    }
    case "drum": {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 12), mat(0xd6432c, "hard"));
      m.position.y = 0.52;
      m.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.12, 12), mat(0x2a2a2a, "hard"));
      band.position.y = 0.75;
      group.add(m, band);
      return ink({ group, radius: 0.5, color: 0xd6432c, defaultHp: 20 });
    }
    case "wall": {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.3), mat(0x8b8f94));
      m.position.y = 0.55;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return ink({ group, radius: 0.9, color: 0x8b8f94, defaultHp: 24 });
    }
    case "sign": {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), mat(0x555555, "hard"));
      pole.position.y = 0.8;
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.06), mat(0xffcc33));
      board.position.y = 1.4;
      group.add(pole, board);
      return ink({ group, radius: 0.55, color: 0xffcc33, defaultHp: 10 });
    }
    case "vending": {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.7, 0.7), mat(0x2f7dbf));
      body.position.y = 0.85;
      body.castShadow = true;
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.05), mat(0x1c1c1c));
      front.position.set(0, 1.0, 0.36);
      group.add(body, front);
      return ink({ group, radius: 0.6, color: 0x2f7dbf, defaultHp: 26 });
    }
  }
}

/** Gives every mesh of a finished prop its ink outline. */
function ink(built: BuiltMesh): BuiltMesh {
  built.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) tagInk(mesh.geometry, PROP_INK);
  });
  addOutlines(built.group);
  return built;
}
