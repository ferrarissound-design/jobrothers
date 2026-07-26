import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { scaleInk, tagInk, toonMaterial, type Ramp } from "../render/celShading";

/**
 * Shared building blocks for the fighter models.
 *
 * The models are still built from Three.js primitives (no external assets), but
 * they use proportioned skeletons and capsule limbs with real elbow / knee
 * joints, so they read as characters rather than as stacks of boxes.
 *
 * Shading and ink outlines come from `render/celShading`, which the stage uses
 * too; this module only decides which cel ramp each costume surface takes.
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

const SURFACE_RAMP: Record<Surface, Ramp> = {
  skin: "soft",
  cloth: "matte",
  denim: "matte",
  leather: "hard",
  metal: "hard",
  rubber: "matte",
  plastic: "hard",
  visor: "hard",
  card: "matte",
  fur: "soft",
  glow: "soft",
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
        bucket.geometries.push(scaleInk(mesh.geometry.clone().applyMatrix4(matrix), matrix));
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

/**
 * Joint heights (in world units) for a humanoid of the given total height.
 *
 * Stylised rather than anatomical: the skeleton is stretched towards the ~6
 * heads-tall build animation uses — long legs, a short torso and a head that
 * takes a sixth of the figure — instead of the 7.5 heads of a real adult.
 */
export function humanProportions(height: number) {
  return {
    height,
    ankle: height * 0.045,
    knee: height * 0.275,
    hip: height * 0.505,
    waist: height * 0.585,
    chest: height * 0.7,
    shoulder: height * 0.788,
    neck: height * 0.822,
    chin: height * 0.835,
    /** Eye line sits low on a stylised head — the big-eyed animation convention. */
    eye: height * 0.9,
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
  private readonly cache = new Map<string, THREE.MeshToonMaterial>();

  /** @param ink Widest ink line this character's parts may carry, world units. */
  constructor(private readonly ink = 0.007) {}

  material(color: number, surface: Surface = "cloth"): THREE.MeshToonMaterial {
    const key = `${color}|${surface}`;
    let material = this.cache.get(key);
    if (!material) {
      material = this.uniqueMaterial(color, surface);
      this.cache.set(key, material);
    }
    return material;
  }

  /** An uncached material, for meshes whose colour or emissive is animated. */
  uniqueMaterial(color: number, surface: Surface = "cloth"): THREE.MeshToonMaterial {
    const material = toonMaterial(SURFACE_RAMP[surface], { color });
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

  /**
   * A whole eye, drawn the way animation draws them: a tall oval that is mostly
   * iris, a heavy upper lash line, and two catch lights — a big one opposite
   * the key light and a small one below it. `radius` is the half-width; the eye
   * stands about 1.4x that tall. Looks down +Z.
   */
  eye(radius: number, iris: number, pupil = 0x140f0c, lash = 0x241a17): THREE.Group {
    const group = new THREE.Group();

    // The eye is layered like a painted cel: every layer sits strictly in front
    // of the one behind it, because a flattened sphere tucked *inside* the
    // sclera would simply be hidden by it.
    const sclera = this.sphere(radius, 0xf7f4ee, "skin", 12);
    sclera.scale.set(1, 1.35, 0.3);
    group.add(sclera);

    // A darker rim around the iris, the way cels ink the outer edge.
    const rimColor = new THREE.Color(iris).multiplyScalar(0.4).getHex();
    const irisRim = this.sphere(radius * 0.66, rimColor, "plastic", 12);
    irisRim.position.set(0, -radius * 0.16, radius * 0.26);
    irisRim.scale.set(1, 1.7, 0.1);
    group.add(irisRim);

    // A tall iris with white showing either side of it — the drawn eye shape.
    const irisMesh = this.sphere(radius * 0.56, iris, "plastic", 12);
    irisMesh.position.set(0, -radius * 0.16, radius * 0.3);
    irisMesh.scale.set(1, 1.8, 0.1);
    group.add(irisMesh);

    const pupilMesh = this.sphere(radius * 0.26, pupil, "plastic", 10);
    pupilMesh.position.set(0, -radius * 0.16, radius * 0.34);
    pupilMesh.scale.set(1, 1.9, 0.1);
    group.add(pupilMesh);

    const glint = this.sphere(radius * 0.24, 0xffffff, "glow", 8);
    glint.position.set(radius * 0.2, radius * 0.4, radius * 0.38);
    glint.scale.set(1, 1.1, 0.08);
    group.add(glint);

    const spark = this.sphere(radius * 0.12, 0xffffff, "glow", 6);
    spark.position.set(-radius * 0.2, -radius * 0.72, radius * 0.38);
    spark.scale.set(1, 1, 0.08);
    group.add(spark);

    // heavy upper lash line — the single strongest anime cue on a face
    const lid = this.sphere(radius, lash, "skin", 12);
    lid.position.set(0, radius * 1.24, radius * 0.12);
    lid.scale.set(1.02, 0.19, 0.42);
    group.add(lid);

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
    tagInk(geometry, this.ink);
    const mesh = new THREE.Mesh(geometry, this.material(color, surface));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
