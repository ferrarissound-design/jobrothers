import * as THREE from "three";
import { GameConfig, type QualitySettings } from "../config/gameConfig";
import { DestructibleObject } from "./DestructibleObject";
import type { EffectManager } from "../core/EffectManager";
import { disposeObject3D } from "../utils/dispose";

export interface PlatformCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  topY: number;
}

export interface StaticCollider {
  x: number;
  z: number;
  radius: number;
}

function mat(color: number, roughness = 0.8, metalness = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/**
 * "ジョー・ジャンクション" — a scrapyard/factory arena. Builds the ground,
 * a couple of raised step platforms, background scrap-junk dressing, and
 * scatters destructible props across the walkable area.
 */
export class Stage {
  group = new THREE.Group();
  platforms: PlatformCollider[] = [];
  staticColliders: StaticCollider[] = [];
  destructibles: DestructibleObject[] = [];
  /** Meshes the camera should not clip through (kept small for raycast performance). */
  collidableMeshes: THREE.Object3D[] = [];
  readonly arenaRadius = GameConfig.arenaRadius;
  spawnPoints: THREE.Vector3[];

  private scene: THREE.Scene;
  private effects: EffectManager;
  private onExplode: (position: THREE.Vector3) => void;

  constructor(
    scene: THREE.Scene,
    effects: EffectManager,
    quality: QualitySettings,
    onExplode: (position: THREE.Vector3) => void
  ) {
    this.scene = scene;
    this.effects = effects;
    this.onExplode = onExplode;

    this.buildGround(quality);
    this.buildPlatforms();
    this.buildDressing(quality);
    this.spawnDestructibles();

    this.scene.add(this.group);

    this.spawnPoints = [
      new THREE.Vector3(0, 0.5, 5),
      new THREE.Vector3(5, 0.5, -3),
      new THREE.Vector3(-5, 0.5, -3),
      new THREE.Vector3(0, 0.5, -7),
    ];
  }

  private buildGround(quality: QualitySettings): void {
    const groundGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 1, 32);
    const ground = new THREE.Mesh(groundGeo, mat(0x54544f, 0.95, 0.05));
    ground.position.y = -0.5;
    ground.receiveShadow = quality.shadows;
    this.group.add(ground);

    // subtle panel seams for visual interest without extra geometry cost
    const ringGeo = new THREE.RingGeometry(this.arenaRadius * 0.55, this.arenaRadius * 0.57, 48);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x3d3d38, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    this.group.add(ring);

    // void backdrop far below so falling reads clearly as "down and gone"
    const voidGeo = new THREE.PlaneGeometry(400, 400);
    const voidMesh = new THREE.Mesh(voidGeo, new THREE.MeshBasicMaterial({ color: 0x05050a }));
    voidMesh.rotation.x = -Math.PI / 2;
    voidMesh.position.y = GameConfig.fallDeathY - 6;
    this.group.add(voidMesh);
  }

  private addPlatformBox(cx: number, cz: number, w: number, d: number, topY: number, color: number): void {
    const h = topY;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.position.set(cx, topY / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.collidableMeshes.push(mesh);
    this.platforms.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      topY,
    });
  }

  private buildPlatforms(): void {
    this.addPlatformBox(8, 6, 3.6, 3.6, 1.5, 0x3d6ea5);
    this.addPlatformBox(-8, 6, 3.6, 3.6, 1.5, 0x3d6ea5);
    this.addPlatformBox(0, -10, 5, 3, 1.1, 0x8a6a3d);
    this.addPlatformBox(11, -6, 2.6, 2.6, 2.2, 0x5a5a52);
  }

  private buildDressing(quality: QualitySettings): void {
    // background shipping containers ringing the arena
    const containerColors = [0xc0392b, 0x2471a3, 0x27ae60, 0xd68910];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = this.arenaRadius + 4 + (i % 2) * 2;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.2, 5.5),
        mat(containerColors[i % containerColors.length])
      );
      container.position.set(x, 1.1, z);
      container.rotation.y = angle;
      container.castShadow = quality.shadows;
      container.receiveShadow = quality.shadows;
      this.group.add(container);
      this.collidableMeshes.push(container);
    }

    // steel girders leaning at the edges
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      const r = this.arenaRadius + 2;
      const girder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), mat(0x555560, 0.6, 0.4));
      girder.position.set(Math.cos(angle) * r, 3, Math.sin(angle) * r);
      girder.rotation.z = 0.15;
      girder.castShadow = quality.shadows;
      this.group.add(girder);
    }

    // small crane silhouette, purely decorative, kept outside the walkable area
    const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 5, 8), mat(0xd68910, 0.6, 0.3));
    craneBase.position.set(-this.arenaRadius - 6, 2.5, -4);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 0.35), mat(0xd68910, 0.6, 0.3));
    craneArm.position.set(-this.arenaRadius - 2, 5, -4);
    this.group.add(craneBase, craneArm);

    // scattered pipes along the boundary (visual only)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.7;
      const r = this.arenaRadius - 1.5;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 8), mat(0x6b7280, 0.5, 0.4));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(Math.cos(angle) * r, 0.25, Math.sin(angle) * r);
      pipe.rotation.y = angle;
      pipe.castShadow = quality.shadows;
      this.group.add(pipe);
    }
  }

  private readonly destructibleLayout: { type: DestructibleObject["type"]; x: number; z: number }[] = [
    { type: "crate", x: 3, z: 2 },
    { type: "crate", x: 3.8, z: 2.9 },
    { type: "drum", x: -3, z: 3 },
    { type: "drum", x: -4.4, z: 1.6 },
    { type: "drum", x: 6, z: -8 },
    { type: "wall", x: -6, z: -6 },
    { type: "sign", x: 4, z: -4 },
    { type: "vending", x: -10, z: -2 },
    { type: "crate", x: 0, z: 8 },
    { type: "drum", x: 9, z: 2 },
  ];

  private spawnDestructibles(): void {
    for (const item of this.destructibleLayout) {
      const d = new DestructibleObject(this.scene, this.effects, {
        type: item.type,
        position: new THREE.Vector3(item.x, 0, item.z),
        onExplode: this.onExplode,
      });
      this.destructibles.push(d);
      this.staticColliders.push({ x: item.x, z: item.z, radius: d.radius });
    }
  }

  removeDestroyed(): void {
    for (let i = this.destructibles.length - 1; i >= 0; i--) {
      if (this.destructibles[i].destroyed) this.destructibles.splice(i, 1);
    }
  }

  /** Removes any surviving destructibles and rebuilds the original layout, used on match restart. */
  resetDestructibles(): void {
    for (const d of this.destructibles) {
      if (!d.destroyed) disposeObject3D(d.group);
    }
    this.destructibles.length = 0;
    this.staticColliders.length = 0;
    this.spawnDestructibles();
  }

  /** Returns the walkable ground height at (x,z), or null if there is no ground (i.e. over the pit). */
  getGroundHeightAt(x: number, z: number, characterY: number): number | null {
    let best: number | null = Math.hypot(x, z) <= this.arenaRadius ? 0 : null;
    for (const p of this.platforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        if (characterY >= p.topY - 0.4) {
          if (best === null || p.topY > best) best = p.topY;
        }
      }
    }
    return best;
  }

  isOverVoid(x: number, z: number): boolean {
    return this.getGroundHeightAt(x, z, -999) === null;
  }
}
