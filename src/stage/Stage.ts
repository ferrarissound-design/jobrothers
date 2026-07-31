import * as THREE from "three";
import { GameConfig, type QualitySettings } from "../config/gameConfig";
import { DestructibleObject } from "./DestructibleObject";
import type { EffectManager } from "../core/EffectManager";
import { disposeObject3D } from "../utils/dispose";
import { inkMesh, toonMaterial, type Ramp } from "../render/celShading";

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

function mat(color: number, ramp: Ramp = "matte"): THREE.MeshToonMaterial {
  return toonMaterial(ramp, { color });
}

/**
 * Ink width for stage geometry, in world units at the reference depth the
 * outline shader normalises to. One value covers scenery at every distance
 * because that shader keeps the line weight constant on screen; parts thinner
 * than the line (pipes, girders) are thinned down by `tagInk` itself.
 */
const STAGE_INK = 0.02;
/** The arena disc reads its line edge-on against the void, so it can take more. */
const GROUND_INK = 0.05;

/** Procedural meadow texture: a green base speckled with grass-blade strokes, tiled across the ground. */
function createGrassTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#4f9c3f";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const light = Math.random() > 0.5;
    ctx.fillStyle = light
      ? `rgba(150,220,110,${0.15 + Math.random() * 0.25})`
      : `rgba(30,80,25,${0.15 + Math.random() * 0.25})`;
    const w = 1 + Math.random() * 2;
    const h = 3 + Math.random() * 5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
    const ground = new THREE.Mesh(groundGeo, toonMaterial("matte", { map: createGrassTexture() }));
    ground.position.y = -0.5;
    ground.receiveShadow = quality.shadows;
    this.group.add(inkMesh(ground, GROUND_INK));

    // a worn dirt ring for visual interest without extra geometry cost
    const ringGeo = new THREE.RingGeometry(this.arenaRadius * 0.55, this.arenaRadius * 0.57, 48);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x3d7a34, side: THREE.DoubleSide }));
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
    this.group.add(inkMesh(mesh, STAGE_INK));
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
      this.group.add(inkMesh(container, STAGE_INK));
      this.collidableMeshes.push(container);
    }

    // steel girders leaning at the edges
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      const r = this.arenaRadius + 2;
      const girder = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), mat(0x555560, "hard"));
      girder.position.set(Math.cos(angle) * r, 3, Math.sin(angle) * r);
      girder.rotation.z = 0.15;
      girder.castShadow = quality.shadows;
      this.group.add(inkMesh(girder, STAGE_INK));
    }

    // small crane silhouette, purely decorative, kept outside the walkable area
    const craneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 5, 8), mat(0xd68910, "hard"));
    craneBase.position.set(-this.arenaRadius - 6, 2.5, -4);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 0.35), mat(0xd68910, "hard"));
    craneArm.position.set(-this.arenaRadius - 2, 5, -4);
    this.group.add(inkMesh(craneBase, STAGE_INK), inkMesh(craneArm, STAGE_INK));

    // scattered pipes along the boundary (visual only)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.7;
      const r = this.arenaRadius - 1.5;
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 8), mat(0x6b7280, "hard"));
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(Math.cos(angle) * r, 0.25, Math.sin(angle) * r);
      pipe.rotation.y = angle;
      pipe.castShadow = quality.shadows;
      this.group.add(inkMesh(pipe, STAGE_INK));
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
    let removed = false;
    for (let i = this.destructibles.length - 1; i >= 0; i--) {
      if (this.destructibles[i].destroyed) {
        this.destructibles.splice(i, 1);
        removed = true;
      }
    }
    // The steering colliders have to go with them, or the CPU keeps swerving
    // around props that were blown up minutes ago.
    if (removed) this.rebuildStaticColliders();
  }

  private rebuildStaticColliders(): void {
    this.staticColliders = this.destructibles.map((d) => ({
      x: d.position.x,
      z: d.position.z,
      radius: d.radius,
    }));
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
