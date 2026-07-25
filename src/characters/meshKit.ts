import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Shared building blocks for the fighter models.
 *
 * The models are still built from Three.js primitives (no external assets), but
 * they use anatomically proportioned skeletons, capsule limbs with real elbow /
 * knee joints and per-surface material properties so they read as characters
 * rather than as stacks of boxes.
 */

export type Surface =
  | "skin"
  | "cloth"
  | "denim"
  | "leather"
  | "metal"
  | "rubber"
  | "plastic"
  | "visor"
  | "card"
  | "fur"
  | "glow";

const SURFACE_PROPS: Record<Surface, { roughness: number; metalness: number }> = {
  skin: { roughness: 0.78, metalness: 0.0 },
  cloth: { roughness: 0.94, metalness: 0.0 },
  denim: { roughness: 0.99, metalness: 0.0 },
  leather: { roughness: 0.52, metalness: 0.06 },
  metal: { roughness: 0.3, metalness: 0.92 },
  rubber: { roughness: 0.88, metalness: 0.0 },
  plastic: { roughness: 0.38, metalness: 0.04 },
  visor: { roughness: 0.1, metalness: 0.7 },
  card: { roughness: 0.96, metalness: 0.0 },
  fur: { roughness: 0.92, metalness: 0.0 },
  glow: { roughness: 0.35, metalness: 0.0 },
};

/** Drops a decoration out of the shadow pass — small parts never read in the shadow map. */
export function noShadow<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });
  return obj;
}

/**
 * Collapses a group whose contents never move relative to each other into one
 * mesh per (material, shadow) pair. The detailed costumes cost 60-70 meshes per
 * fighter before baking and roughly a third of that after, which matters with
 * four fighters plus a shadow pass.
 *
 * Only call this on groups that are animated as a whole, never on limb chains.
 * Descendants listed in `skip` are left untouched, along with their children.
 */
export function bakeStatic(group: THREE.Object3D, skip: THREE.Object3D[] = []): void {
  interface Bucket {
    material: THREE.Material;
    castShadow: boolean;
    receiveShadow: boolean;
    geometries: THREE.BufferGeometry[];
  }
  const buckets = new Map<string, Bucket>();
  const kept: THREE.Object3D[] = [];
  const scratch = new THREE.Matrix4();

  const collect = (parent: THREE.Object3D, parentMatrix: THREE.Matrix4): void => {
    for (const child of [...parent.children]) {
      if (skip.includes(child)) {
        child.removeFromParent();
        kept.push(child);
        continue;
      }
      child.updateMatrix();
      const matrix = new THREE.Matrix4().multiplyMatrices(parentMatrix, child.matrix);
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            material: mesh.material,
            castShadow: mesh.castShadow,
            receiveShadow: mesh.receiveShadow,
            geometries: [],
          };
          buckets.set(key, bucket);
        }
        bucket.geometries.push(mesh.geometry.clone().applyMatrix4(matrix));
        mesh.geometry.dispose();
      }
      collect(child, matrix);
      child.removeFromParent();
    }
  };
  collect(group, scratch.identity());

  for (const bucket of buckets.values()) {
    const merged = bucket.geometries.length === 1 ? bucket.geometries[0] : mergeGeometries(bucket.geometries);
    // A failed merge (mismatched attributes) falls back to unmerged meshes so
    // nothing silently disappears from the model.
    const geometries = merged ? [merged] : bucket.geometries;
    if (merged && merged !== bucket.geometries[0]) bucket.geometries.forEach((g) => g.dispose());
    for (const geometry of geometries) {
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      group.add(mesh);
    }
  }
  for (const child of kept) group.add(child);
}

/** Bakes each segment of a limb, keeping the joints that the animation drives. */
export function bakeLimb(limb: Limb): void {
  bakeStatic(limb.tip);
  bakeStatic(limb.joint, [limb.tip]);
  bakeStatic(limb.root, [limb.joint]);
}

/** Anatomical joint heights (in world units) for a humanoid of the given total height. */
export function humanProportions(height: number) {
  return {
    height,
    ankle: height * 0.048,
    knee: height * 0.285,
    hip: height * 0.52,
    waist: height * 0.6,
    chest: height * 0.72,
    shoulder: height * 0.815,
    neck: height * 0.855,
    chin: height * 0.87,
    /** Eye line sits mid-head on a real skull. */
    eye: height * 0.935,
    crown: height,
  };
}

export interface LimbSpec {
  /** Hip-to-knee / shoulder-to-elbow length. */
  upperLength: number;
  upperRadius: number;
  /** Knee-to-ankle / elbow-to-wrist length. */
  lowerLength: number;
  lowerRadius: number;
  color: number;
  surface?: Surface;
  /** Overrides for the lower segment (sleeve vs. glove, trouser vs. boot). */
  lowerColor?: number;
  lowerSurface?: Surface;
  /** Resting bend at the elbow / knee, radians. Negative bends backwards. */
  bend?: number;
  /** Colour of the elbow / knee cap. Defaults to the segment colour. */
  jointColor?: number;
}

export interface Limb {
  /** Pivot at the shoulder / hip — this is what the animation rotates. */
  root: THREE.Group;
  /** Pivot at the elbow / knee. */
  joint: THREE.Group;
  /** Attachment point at the wrist / ankle. */
  tip: THREE.Group;
}

/**
 * Central material cache + primitive factory for one character. Meshes that
 * share a (colour, surface) pair share a material, which keeps the material
 * count of a four-fighter match low.
 */
export class ModelKit {
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();

  material(color: number, surface: Surface = "cloth"): THREE.MeshStandardMaterial {
    const key = `${color}|${surface}`;
    let material = this.cache.get(key);
    if (!material) {
      material = this.uniqueMaterial(color, surface);
      this.cache.set(key, material);
    }
    return material;
  }

  /** An uncached material, for meshes whose colour or emissive is animated. */
  uniqueMaterial(color: number, surface: Surface = "cloth"): THREE.MeshStandardMaterial {
    const props = SURFACE_PROPS[surface];
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: props.roughness,
      metalness: props.metalness,
    });
    if (surface === "glow") {
      material.emissive = new THREE.Color(color);
      material.emissiveIntensity = 0.9;
    }
    if (surface === "visor") {
      material.transparent = true;
      material.opacity = 0.86;
    }
    return material;
  }

  box(w: number, h: number, d: number, color: number, surface: Surface = "cloth"): THREE.Mesh {
    return this.build(new THREE.BoxGeometry(w, h, d), color, surface);
  }

  sphere(r: number, color: number, surface: Surface = "cloth", seg = 14): THREE.Mesh {
    return this.build(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.72))), color, surface);
  }

  /** Capsule whose *total* height (caps included) is `length`. */
  capsule(r: number, length: number, color: number, surface: Surface = "cloth", seg = 12): THREE.Mesh {
    const body = Math.max(0.001, length - r * 2);
    return this.build(new THREE.CapsuleGeometry(r, body, 4, seg), color, surface);
  }

  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    color: number,
    surface: Surface = "cloth",
    seg = 12,
    openEnded = false
  ): THREE.Mesh {
    return this.build(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, openEnded), color, surface);
  }

  cone(r: number, h: number, color: number, surface: Surface = "cloth", seg = 10): THREE.Mesh {
    return this.build(new THREE.ConeGeometry(r, h, seg), color, surface);
  }

  /** Upper half of a sphere — cap crowns, helmet shells, shoulder pads. */
  dome(r: number, color: number, surface: Surface = "cloth", seg = 16): THREE.Mesh {
    return this.build(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.5), 0, Math.PI * 2, 0, Math.PI / 2), color, surface);
  }

  /** Half disc, used for cap brims and visors. Faces +Z after the default rotation. */
  halfDisc(r: number, thickness: number, color: number, surface: Surface = "cloth", seg = 16): THREE.Mesh {
    return this.build(
      new THREE.CylinderGeometry(r, r, thickness, seg, 1, false, -Math.PI / 2, Math.PI),
      color,
      surface
    );
  }

  /**
   * A patch of a sphere's surface — visor bands, hair shells, shoulder plates.
   * `phi` runs around the vertical axis (`phi = PI / 2` faces +Z), `theta` from
   * the north pole down.
   */
  shell(
    r: number,
    color: number,
    surface: Surface,
    opts: { phiStart?: number; phiLength?: number; thetaStart?: number; thetaLength?: number; seg?: number } = {}
  ): THREE.Mesh {
    const seg = opts.seg ?? 16;
    return this.build(
      new THREE.SphereGeometry(
        r,
        seg,
        Math.max(4, Math.round(seg * 0.6)),
        opts.phiStart ?? 0,
        opts.phiLength ?? Math.PI * 2,
        opts.thetaStart ?? 0,
        opts.thetaLength ?? Math.PI
      ),
      color,
      surface
    );
  }

  torusArc(r: number, tube: number, arc: number, color: number, surface: Surface = "metal"): THREE.Mesh {
    return this.build(new THREE.TorusGeometry(r, tube, 6, 16, arc), color, surface);
  }

  /** A whole eye: sclera, iris, pupil and a catch light. Looks down +Z. */
  eye(radius: number, iris: number, pupil = 0x140f0c): THREE.Group {
    const group = new THREE.Group();

    const sclera = this.sphere(radius, 0xf3efe7, "skin", 12);
    sclera.scale.set(1, 1, 0.72);
    group.add(sclera);

    const irisMesh = this.sphere(radius * 0.52, iris, "plastic", 10);
    irisMesh.position.z = radius * 0.6;
    irisMesh.scale.set(1, 1, 0.35);
    group.add(irisMesh);

    const pupilMesh = this.sphere(radius * 0.26, pupil, "plastic", 8);
    pupilMesh.position.z = radius * 0.74;
    pupilMesh.scale.set(1, 1, 0.35);
    group.add(pupilMesh);

    const glint = this.sphere(radius * 0.16, 0xffffff, "glow", 6);
    glint.position.set(radius * 0.26, radius * 0.3, radius * 0.76);
    glint.scale.set(1, 1, 0.3);
    group.add(glint);

    return noShadow(group);
  }

  /**
   * Two-segment limb with a real joint. `root` pivots at the shoulder / hip,
   * `joint` at the elbow / knee, `tip` marks the wrist / ankle.
   */
  limb(spec: LimbSpec): Limb {
    const surface = spec.surface ?? "cloth";
    const lowerColor = spec.lowerColor ?? spec.color;
    const lowerSurface = spec.lowerSurface ?? surface;

    const root = new THREE.Group();

    const shoulderCap = this.sphere(spec.upperRadius * 1.12, spec.color, surface, 12);
    root.add(shoulderCap);

    const upper = this.capsule(spec.upperRadius, spec.upperLength, spec.color, surface);
    upper.position.y = -spec.upperLength / 2;
    root.add(upper);

    const joint = new THREE.Group();
    joint.position.y = -spec.upperLength;
    joint.rotation.x = spec.bend ?? 0;
    root.add(joint);

    const jointCap = this.sphere(spec.lowerRadius * 1.08, spec.jointColor ?? lowerColor, lowerSurface, 10);
    joint.add(noShadow(jointCap));

    const lower = this.capsule(spec.lowerRadius, spec.lowerLength, lowerColor, lowerSurface);
    lower.position.y = -spec.lowerLength / 2;
    joint.add(lower);

    const tip = new THREE.Group();
    tip.position.y = -spec.lowerLength;
    joint.add(tip);

    return { root, joint, tip };
  }

  private build(geometry: THREE.BufferGeometry, color: number, surface: Surface): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color, surface));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
