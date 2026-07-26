import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Shared building blocks for the fighter models.
 *
 * The models are still built from Three.js primitives (no external assets), but
 * they use proportioned skeletons and capsule limbs with real elbow / knee
 * joints, so they read as characters rather than as stacks of boxes.
 *
 * The look is cel shaded: every surface is a `MeshToonMaterial` reading a
 * stepped gradient ramp, and every mesh carries an inverted-hull ink outline,
 * so the fighters read as drawn animation cels rather than as lit plastic.
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

/**
 * How light is quantised on a surface. Faces get the classic two-tone cel
 * break, fabric a soft three-tone, hard surfaces an extra band that stands in
 * for the specular an unlit toon material cannot produce.
 */
type Ramp = "face" | "matte" | "hard";

const RAMP_STOPS: Record<Ramp, number[]> = {
  face: [0.6, 1.0],
  matte: [0.46, 0.8, 1.0],
  hard: [0.34, 0.6, 0.85, 1.0],
};

const SURFACE_RAMP: Record<Surface, Ramp> = {
  skin: "face",
  cloth: "matte",
  denim: "matte",
  leather: "hard",
  metal: "hard",
  rubber: "matte",
  plastic: "hard",
  visor: "hard",
  card: "matte",
  fur: "face",
  glow: "face",
};

const gradientCache = new Map<string, THREE.DataTexture>();

/** Stepped grey ramp used as a toon `gradientMap`; one texture per stop list. */
function gradientMap(stops: number[]): THREE.DataTexture {
  const key = stops.join(",");
  let texture = gradientCache.get(key);
  if (!texture) {
    const data = new Uint8Array(stops.length * 4);
    stops.forEach((stop, i) => {
      const v = Math.round(THREE.MathUtils.clamp(stop, 0, 1) * 255);
      data.set([v, v, v, 255], i * 4);
    });
    texture = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    gradientCache.set(key, texture);
  }
  return texture;
}

/** Per-vertex ink width, written by `ModelKit` and read by the outline shader. */
const INK_ATTRIBUTE = "inkWidth";

const OUTLINE_VERTEX = /* glsl */ `
  attribute float ${INK_ATTRIBUTE};
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    view.xyz += normalize(normalMatrix * normal) * ${INK_ATTRIBUTE};
    gl_Position = projectionMatrix * view;
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform vec3 inkColor;
  void main() {
    gl_FragColor = vec4(inkColor, 1.0);
  }
`;

/**
 * Draws an ink line around every mesh under `root` by rendering a back-faced
 * copy pushed out along its normals — the standard inverted-hull trick. The
 * push happens in view space so that a squashed or mirrored part still gets an
 * even line, which a scaled-up clone could not give.
 *
 * Line width is per vertex (tagged in `ModelKit.build`, rescaled in
 * `scaleInk`) rather than global: one width for a whole fighter would swallow
 * whiskers, seam tape and mouth lines in ink.
 *
 * Call this once the model is fully baked — the outline meshes share the baked
 * geometry, so there is nothing left for a later merge to get wrong.
 */
export function addOutlines(root: THREE.Object3D, ink = 0x1d1512): void {
  const material = new THREE.ShaderMaterial({
    uniforms: { inkColor: { value: new THREE.Color(ink) } },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
  });

  // Collected up front: adding children while traversing would re-enter the
  // outline meshes and outline the outlines.
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // Transparent surfaces (visors, lenses) would show their own hull through
    // themselves, so they stay un-inked.
    if (
      mesh.isMesh &&
      !Array.isArray(mesh.material) &&
      !mesh.material.transparent &&
      mesh.geometry.hasAttribute(INK_ATTRIBUTE)
    ) {
      meshes.push(mesh);
    }
  });

  for (const mesh of meshes) {
    const outline = new THREE.Mesh(mesh.geometry, material);
    outline.castShadow = false;
    outline.receiveShadow = false;
    mesh.add(outline);
  }
}

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

/**
 * Brings a part's ink budget into world units once baking has applied its
 * transform. Parts are authored as spheres and boxes and then squashed into
 * place — an eye is a ball flattened to a disc — so a width chosen from the
 * unscaled primitive would ink the flattened result far too heavily. The
 * smallest axis scale is the safe one: it under-inks rather than smears.
 */
function scaleInk(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const ink = geometry.getAttribute(INK_ATTRIBUTE);
  if (!ink) return geometry;
  const m = matrix.elements;
  const scale = Math.min(
    Math.hypot(m[0], m[1], m[2]),
    Math.hypot(m[4], m[5], m[6]),
    Math.hypot(m[8], m[9], m[10])
  );
  const values = ink.array as Float32Array;
  for (let i = 0; i < values.length; i++) values[i] *= scale;
  ink.needsUpdate = true;
  return geometry;
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
    const material = new THREE.MeshToonMaterial({
      color,
      gradientMap: gradientMap(RAMP_STOPS[SURFACE_RAMP[surface]]),
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
    this.tagInkWidth(geometry);
    const mesh = new THREE.Mesh(geometry, this.material(color, surface));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Records how thick this part's ink line may be, before baking merges it into
   * its neighbours. The budget comes from the part's *thinnest* dimension: a
   * whisker or a strip of packing tape is thinner than the line a torso wants,
   * and inking it at full width would turn it into a black smear.
   */
  private tagInkWidth(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const width = Math.min(this.ink, Math.min(size.x, size.y, size.z) * 0.35);
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute(INK_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(count).fill(width), 1));
  }
}
