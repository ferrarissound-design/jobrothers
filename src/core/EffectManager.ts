import * as THREE from "three";
import { ObjectPool } from "../utils/objectPool";
import type { QualitySettings } from "../config/gameConfig";
import { toonMaterial } from "../render/celShading";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  spin: THREE.Vector3;
  fadeOut: boolean;
  startScale: number;
}

const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
const sharedSphereGeo = new THREE.SphereGeometry(0.5, 6, 5);

/**
 * Lightweight pooled particle system built entirely from basic Three.js
 * primitives (no textures/sprites), used for hit sparks, smoke, electricity,
 * explosions, shockwaves and fall trails.
 */
export class EffectManager {
  private scene: THREE.Scene;
  private active: Particle[] = [];
  private pool: ObjectPool<Particle>;
  private quality: QualitySettings;
  private shockwaves: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];
  private fragments: Particle[] = [];
  private fragmentPool: ObjectPool<Particle>;

  constructor(scene: THREE.Scene, quality: QualitySettings) {
    this.scene = scene;
    this.quality = quality;
    this.pool = new ObjectPool<Particle>(
      () => {
        const mesh = new THREE.Mesh(
          sharedSphereGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
        );
        mesh.visible = false;
        this.scene.add(mesh);
        return {
          mesh,
          velocity: new THREE.Vector3(),
          life: 0,
          maxLife: 1,
          gravity: 0,
          spin: new THREE.Vector3(),
          fadeOut: true,
          startScale: 1,
        };
      },
      (p) => {
        p.mesh.visible = true;
        p.mesh.scale.setScalar(1);
      },
      300
    );

    this.fragmentPool = new ObjectPool<Particle>(
      () => {
        const mesh = new THREE.Mesh(sharedBoxGeo, toonMaterial("matte", { color: 0xffffff }));
        mesh.visible = false;
        mesh.castShadow = true;
        this.scene.add(mesh);
        return {
          mesh,
          velocity: new THREE.Vector3(),
          life: 0,
          maxLife: 1,
          gravity: -20,
          spin: new THREE.Vector3(),
          fadeOut: false,
          startScale: 1,
        };
      },
      (p) => {
        p.mesh.visible = true;
      },
      120
    );
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
  }

  /** Spawns small debris cubes when a destructible object breaks. Count is capped by quality.maxFragments. */
  spawnFragments(position: THREE.Vector3, color: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      if (this.fragments.length >= this.quality.maxFragments) break;
      const p = this.fragmentPool.acquire();
      p.mesh.geometry = sharedBoxGeo;
      const mat = p.mesh.material as THREE.MeshToonMaterial;
      mat.color.setHex(color);
      mat.opacity = 1;
      mat.transparent = false;
      p.mesh.position.copy(position);
      p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const scale = 0.08 + Math.random() * 0.14;
      p.startScale = scale;
      p.mesh.scale.setScalar(scale);
      const dir = randomDir();
      dir.y = Math.abs(dir.y) * 0.7 + 0.3;
      p.velocity.copy(dir.multiplyScalar(3 + Math.random() * 4));
      p.life = 1.4 + Math.random() * 0.8;
      p.maxLife = p.life;
      p.gravity = -20;
      p.spin.set(randSpin(), randSpin(), randSpin());
      this.fragments.push(p);
    }
  }

  private spawnParticle(
    position: THREE.Vector3,
    color: number,
    opts: {
      velocity?: THREE.Vector3;
      life?: number;
      gravity?: number;
      scale?: number;
      geometry?: "box" | "sphere";
      fadeOut?: boolean;
    } = {}
  ): void {
    if (this.active.length >= this.quality.maxParticles) return;
    const p = this.pool.acquire();
    p.mesh.geometry = opts.geometry === "box" ? sharedBoxGeo : sharedSphereGeo;
    const mat = p.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 1;
    p.mesh.position.copy(position);
    p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    const scale = opts.scale ?? 0.2;
    p.startScale = scale;
    p.mesh.scale.setScalar(scale);
    p.velocity.copy(opts.velocity ?? new THREE.Vector3());
    p.life = opts.life ?? 0.5;
    p.maxLife = p.life;
    p.gravity = opts.gravity ?? -18;
    p.fadeOut = opts.fadeOut ?? true;
    p.spin.set(randSpin(), randSpin(), randSpin());
    this.active.push(p);
  }

  spawnHitSpark(position: THREE.Vector3, color = 0xffe066, count = 8): void {
    for (let i = 0; i < count; i++) {
      const dir = randomDir();
      dir.y = Math.abs(dir.y) * 0.6 + 0.2;
      this.spawnParticle(position, color, {
        velocity: dir.multiplyScalar(5 + Math.random() * 4),
        life: 0.22 + Math.random() * 0.15,
        scale: 0.09 + Math.random() * 0.07,
        geometry: "box",
        gravity: -22,
      });
    }
  }

  spawnSmoke(position: THREE.Vector3, count = 6): void {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(randRange(-1, 1), Math.random() * 0.6 + 0.3, randRange(-1, 1));
      this.spawnParticle(position, 0x888899, {
        velocity: dir.multiplyScalar(1.5 + Math.random()),
        life: 0.6 + Math.random() * 0.4,
        scale: 0.25 + Math.random() * 0.2,
        gravity: -2,
        geometry: "sphere",
      });
    }
  }

  spawnElectric(position: THREE.Vector3, count = 10): void {
    for (let i = 0; i < count; i++) {
      const dir = randomDir();
      this.spawnParticle(position, 0x66e0ff, {
        velocity: dir.multiplyScalar(4 + Math.random() * 5),
        life: 0.12 + Math.random() * 0.1,
        scale: 0.06 + Math.random() * 0.05,
        gravity: 0,
        geometry: "box",
      });
    }
  }

  spawnExplosion(position: THREE.Vector3, count = 18): void {
    for (let i = 0; i < count; i++) {
      const dir = randomDir();
      dir.y = Math.abs(dir.y) * 0.8 + 0.2;
      const isFlame = i % 2 === 0;
      this.spawnParticle(position, isFlame ? 0xff8a3d : 0x555555, {
        velocity: dir.multiplyScalar(6 + Math.random() * 8),
        life: 0.4 + Math.random() * 0.5,
        scale: 0.18 + Math.random() * 0.22,
        gravity: isFlame ? -6 : -14,
        geometry: isFlame ? "sphere" : "box",
      });
    }
    this.spawnShockwave(position, 0xff9c42, 3.2);
  }

  spawnFallLight(position: THREE.Vector3): void {
    for (let i = 0; i < 8; i++) {
      this.spawnParticle(position, 0x66ccff, {
        velocity: new THREE.Vector3(randRange(-1, 1), 3 + Math.random() * 3, randRange(-1, 1)),
        life: 0.5,
        scale: 0.12,
        gravity: -4,
        geometry: "sphere",
      });
    }
  }

  spawnShockwave(position: THREE.Vector3, color = 0xffffff, maxScale = 2.4): void {
    if (this.shockwaves.length >= 10) return;
    const geo = new THREE.RingGeometry(0.2, 0.35, 20);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y = Math.max(0.05, position.y);
    mesh.rotation.x = -Math.PI / 2;
    (mesh as any).__maxScale = maxScale;
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, life: 0.35, maxLife: 0.35 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.pool.release(p);
        this.active.splice(i, 1);
        continue;
      }
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      if (p.fadeOut) {
        const t = p.life / p.maxLife;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
        p.mesh.scale.setScalar(p.startScale * (0.5 + t * 0.5));
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt;
      const t = 1 - s.life / s.maxLife;
      const maxScale = (s.mesh as any).__maxScale ?? 2.4;
      const scale = 0.3 + t * maxScale;
      s.mesh.scale.set(scale, scale, scale);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t) * 0.85;
      if (s.life <= 0) {
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.scene.remove(s.mesh);
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const p = this.fragments[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.fragmentPool.release(p);
        this.fragments.splice(i, 1);
        continue;
      }
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      if (p.mesh.position.y < 0.05 && p.velocity.y < 0) {
        p.mesh.position.y = 0.05;
        p.velocity.y *= -0.35;
        p.velocity.x *= 0.6;
        p.velocity.z *= 0.6;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
    }
  }

  get activeCount(): number {
    return this.active.length + this.shockwaves.length + this.fragments.length;
  }
}

function randSpin(): number {
  return randRange(-8, 8);
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomDir(): THREE.Vector3 {
  const v = new THREE.Vector3(randRange(-1, 1), randRange(-1, 1), randRange(-1, 1));
  if (v.lengthSq() < 0.0001) v.set(0, 1, 0);
  return v.normalize();
}
