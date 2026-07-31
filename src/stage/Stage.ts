import * as THREE from "three";
import { GameConfig, type QualitySettings } from "../config/gameConfig";
import { DestructibleObject } from "./DestructibleObject";
import type { EffectManager } from "../core/EffectManager";
import { disposeObject3D } from "../utils/dispose";
import { inkMesh, toonMaterial, type Ramp } from "../render/celShading";
import { STAGES, DEFAULT_STAGE_ID, type StageDef, type StageGroundDef } from "./stageData";

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

/**
 * The arena floor, painted on a canvas rather than loaded — the project ships
 * no image assets. Both surfaces are the same recipe (a flat base dusted with
 * speckles); only the shape of the speckle changes, from grass blades stood on
 * end to the flecks and panel seams of a poured concrete roof.
 */
function createGroundTexture(def: StageGroundDef): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = def.base;
  ctx.fillRect(0, 0, size, size);

  const speckles = def.kind === "grass" ? 1200 : 900;
  for (let i = 0; i < speckles; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const light = Math.random() > 0.5;
    const tone = light ? def.speckleLight : def.speckleDark;
    ctx.fillStyle = `rgba(${tone},${0.15 + Math.random() * 0.25})`;

    if (def.kind === "grass") {
      // Blades: tall, thin and rotated any which way.
      const w = 1 + Math.random() * 2;
      const h = 3 + Math.random() * 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      // Aggregate: small round flecks, no grain direction.
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + Math.random() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (def.kind === "concrete") {
    // Seams between poured slabs, which is what makes a flat grey floor read
    // as a built surface rather than as untextured geometry.
    ctx.strokeStyle = `rgba(${def.speckleDark},0.45)`;
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const p = (i / 4) * size;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Lit-window strip wrapped around the skyline buildings, shared by all of them. */
function createWindowTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1d1a2e";
  ctx.fillRect(0, 0, w, h);

  const cols = 6;
  const rows = 14;
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      // Roughly a third of the windows are lit; the rest stay dark so the
      // building reads as occupied rather than as a glowing slab.
      if (Math.random() > 0.35) continue;
      ctx.fillStyle = Math.random() > 0.3 ? "#ffd98a" : "#ffa64d";
      ctx.fillRect((cx + 0.25) * (w / cols), (cy + 0.25) * (h / rows), (w / cols) * 0.5, (h / rows) * 0.45);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * One arena, built from a `StageDef`.
 *
 * Everything that differs between stages — floor, lighting values, platform
 * layout, scenery, breakable props, spawn points — lives in that definition
 * (see `stageData.ts`), so this class is the single builder for all of them
 * and the game swaps stages by disposing one instance and constructing
 * another. Only the *lighting* is applied outside: the lights belong to the
 * scene, not to the arena, so `Game` reads `def.lighting` itself.
 */
export class Stage {
  readonly def: StageDef;
  group = new THREE.Group();
  platforms: PlatformCollider[] = [];
  staticColliders: StaticCollider[] = [];
  destructibles: DestructibleObject[] = [];
  /** Meshes the camera should not clip through (kept small for raycast performance). */
  collidableMeshes: THREE.Object3D[] = [];
  readonly arenaRadius: number;
  spawnPoints: THREE.Vector3[];

  private scene: THREE.Scene;
  private effects: EffectManager;
  private onExplode: (position: THREE.Vector3) => void;

  constructor(
    scene: THREE.Scene,
    effects: EffectManager,
    quality: QualitySettings,
    onExplode: (position: THREE.Vector3) => void,
    def: StageDef = STAGES[DEFAULT_STAGE_ID]
  ) {
    this.scene = scene;
    this.effects = effects;
    this.onExplode = onExplode;
    this.def = def;
    this.arenaRadius = def.arenaRadius;

    this.buildGround(quality);
    this.buildPlatforms();
    this.buildDressing(quality);
    this.spawnDestructibles();

    this.scene.add(this.group);

    this.spawnPoints = def.spawnPoints.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  }

  private buildGround(quality: QualitySettings): void {
    const g = this.def.ground;
    const groundGeo = new THREE.CylinderGeometry(this.arenaRadius, this.arenaRadius, 1, 32);
    const ground = new THREE.Mesh(groundGeo, toonMaterial("matte", { map: createGroundTexture(g) }));
    ground.position.y = -0.5;
    ground.receiveShadow = quality.shadows;
    this.group.add(inkMesh(ground, GROUND_INK));

    // a worn ring for visual interest without extra geometry cost
    const ringGeo = new THREE.RingGeometry(this.arenaRadius * 0.55, this.arenaRadius * 0.57, 48);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: g.ringColor, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    this.group.add(ring);

    // Flat trim band at the rim. Purely visual — it sits flush with the floor
    // rather than standing up as a parapet, because a wall a fighter can be
    // knocked straight through would lie about where the edge is.
    if (g.rimColor !== undefined) {
      const trimGeo = new THREE.RingGeometry(this.arenaRadius - 0.7, this.arenaRadius, 64);
      const trim = new THREE.Mesh(trimGeo, new THREE.MeshBasicMaterial({ color: g.rimColor, side: THREE.DoubleSide }));
      trim.rotation.x = -Math.PI / 2;
      trim.position.y = 0.002;
      this.group.add(trim);
    }

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
    for (const p of this.def.platforms) {
      this.addPlatformBox(p.x, p.z, p.w, p.d, p.topY, p.color);
    }
  }

  private buildDressing(quality: QualitySettings): void {
    if (this.def.dressing === "skyline") this.buildSkylineDressing(quality);
    else this.buildScrapyardDressing(quality);
  }

  private buildScrapyardDressing(quality: QualitySettings): void {
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

  /**
   * The city the roof sits on: a ring of neighbouring towers whose tops rise
   * past the arena floor, so the horizon is broken up and the drop off the edge
   * reads as "several storeys down" rather than as an abstract void.
   */
  private buildSkylineDressing(quality: QualitySettings): void {
    const windows = createWindowTexture();
    const towerColors = [0x39304f, 0x2f2a44, 0x453a5c, 0x2a2740];

    for (let i = 0; i < 11; i++) {
      const angle = (i / 11) * Math.PI * 2 + 0.25;
      const r = this.arenaRadius + 7 + (i % 3) * 5;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      // Deterministic-looking variety without randomness, so the skyline is the
      // same every match and players can use it to orient themselves.
      const height = 9 + ((i * 7) % 5) * 4.5;
      const width = 4 + ((i * 3) % 4);

      // Sunk below the arena floor, so only the upper storeys clear it and the
      // drop off the edge reads as a city several storeys down.
      const centerY = height / 2 - 12;
      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, width),
        mat(towerColors[i % towerColors.length])
      );
      tower.position.set(x, centerY, z);
      tower.castShadow = quality.shadows;
      this.group.add(inkMesh(tower, STAGE_INK));
      this.collidableMeshes.push(tower);

      // Window strip on the face turned towards the arena. `lookAt` aims the
      // plane's front at the centre, and translateZ then walks it out along
      // that same axis until it clears the box — far enough to miss the corner
      // even when the arena lies diagonally off the tower.
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.8, height * 0.86),
        new THREE.MeshBasicMaterial({ map: windows })
      );
      face.position.set(x, centerY, z);
      face.lookAt(0, centerY, 0);
      face.translateZ(width * 0.72);
      this.group.add(face);
    }

    // Antenna masts on the near towers, with a warning light at the tip.
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 1.1;
      const r = this.arenaRadius + 9;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 6), mat(0x4a4458, "hard"));
      mast.position.set(Math.cos(angle) * r, 8, Math.sin(angle) * r);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4d4d })
      );
      lamp.position.set(Math.cos(angle) * r, 12.7, Math.sin(angle) * r);
      this.group.add(inkMesh(mast, STAGE_INK), lamp);
    }

    // Roof furniture inside the arena: vent stacks that dress the floor without
    // getting in the way (visual only, same as the junction's loose pipes).
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.5;
      const r = this.arenaRadius - 3;
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.1, 10), mat(0x8d949c, "hard"));
      vent.position.set(Math.cos(angle) * r, 0.55, Math.sin(angle) * r);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 0.22, 10), mat(0x6d747c, "hard"));
      cap.position.set(vent.position.x, 1.2, vent.position.z);
      vent.castShadow = quality.shadows;
      this.group.add(inkMesh(vent, STAGE_INK), inkMesh(cap, STAGE_INK));
    }
  }

  private spawnDestructibles(): void {
    for (const item of this.def.destructibles) {
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

  /**
   * Tears the whole arena out of the scene. Used when switching stages — the
   * props are separate scene children, so they have to go individually.
   */
  dispose(): void {
    for (const d of this.destructibles) {
      if (!d.destroyed) disposeObject3D(d.group);
    }
    this.destructibles.length = 0;
    this.staticColliders.length = 0;
    this.platforms.length = 0;
    this.collidableMeshes.length = 0;
    disposeObject3D(this.group);
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
