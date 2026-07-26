import * as THREE from "three";

/**
 * The game's cel-shading kit, shared by the fighters and the stage.
 *
 * Two pieces make the look: surfaces are `MeshToonMaterial`s reading a stepped
 * gradient ramp instead of a smooth PBR falloff, and every solid mesh carries an
 * inverted-hull ink outline. Anything drawn with only one of the two reads as a
 * different game, so both live here and everything visible goes through it.
 */

/**
 * How light is quantised on a surface: two tones for skin and fur, three for
 * fabric and painted surfaces, four for hard ones where the extra band stands
 * in for the specular a toon material cannot produce.
 */
export type Ramp = "soft" | "matte" | "hard";

const RAMP_STOPS: Record<Ramp, number[]> = {
  soft: [0.6, 1.0],
  matte: [0.46, 0.8, 1.0],
  hard: [0.34, 0.6, 0.85, 1.0],
};

const gradientCache = new Map<Ramp, THREE.DataTexture>();

/** Stepped grey ramp used as a toon `gradientMap`; one shared texture per ramp. */
export function gradientMap(ramp: Ramp): THREE.DataTexture {
  let texture = gradientCache.get(ramp);
  if (!texture) {
    const stops = RAMP_STOPS[ramp];
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
    gradientCache.set(ramp, texture);
  }
  return texture;
}

/** A cel-shaded material. Every parameter but the ramp is plain `MeshToonMaterial`. */
export function toonMaterial(
  ramp: Ramp,
  params: THREE.MeshToonMaterialParameters = {}
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: gradientMap(ramp), ...params });
}

/** Per-vertex ink width, written by `tagInk` and read by the outline shader. */
export const INK_ATTRIBUTE = "inkWidth";

/**
 * Distance at which a tagged ink width is drawn exactly as authored — roughly
 * where the chase camera sits behind a fighter.
 */
const INK_REFERENCE_DEPTH = 7.0;

/**
 * Widths are authored in world units but drawn at a roughly constant weight on
 * screen, the way ink on a drawing does not get thinner because the subject is
 * further away. Without this the outlines simply dissolve on the scenery ring
 * and fatten into a black border whenever the camera pulls in close. The clamp
 * keeps both extremes sane: never thinner than half, never wider than 2.5x.
 */
const OUTLINE_VERTEX = /* glsl */ `
  attribute float ${INK_ATTRIBUTE};
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    float weight = clamp(-view.z / ${INK_REFERENCE_DEPTH.toFixed(1)}, 0.5, 2.5);
    view.xyz += normalize(normalMatrix * normal) * ${INK_ATTRIBUTE} * weight;
    gl_Position = projectionMatrix * view;
  }
`;

const OUTLINE_FRAGMENT = /* glsl */ `
  uniform vec3 inkColor;
  void main() {
    gl_FragColor = vec4(inkColor, 1.0);
  }
`;

export const INK_COLOR = 0x1d1512;

/**
 * The back-faced hull material, one per outlined model rather than one shared
 * scene-wide: props are torn down with `disposeObject3D`, which disposes every
 * material it walks, and a single shared instance would take the outlines off
 * everything else in the arena the first time a crate broke. Three.js caches
 * the compiled program, so the duplicates cost next to nothing.
 */
function inkMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { inkColor: { value: new THREE.Color(color) } },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
  });
}

/**
 * Records how wide this part's ink line may be. The budget comes from the
 * part's *thinnest* dimension rather than one width for the whole model: a
 * whisker, a sign pole or a strip of packing tape is thinner than the line a
 * torso or a shipping container wants, and inking it at full width would turn
 * it into a black smear.
 */
export function tagInk(geometry: THREE.BufferGeometry, maxWidth: number): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const width = Math.min(maxWidth, Math.min(size.x, size.y, size.z) * 0.35);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(INK_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(count).fill(width), 1));
  return geometry;
}

/**
 * Brings a tagged ink budget into world units once a transform has been applied
 * to the geometry (see `bakeStatic`). Parts are authored as spheres and boxes
 * and then squashed into place — an eye is a ball flattened to a disc — so a
 * width chosen from the unscaled primitive would ink the flattened result far
 * too heavily. The smallest axis scale is the safe one: it under-inks rather
 * than smears.
 */
export function scaleInk(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
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

/**
 * Draws an ink line around every tagged mesh under `root` by rendering a
 * back-faced copy pushed out along its normals — the standard inverted-hull
 * trick. The push happens in view space so that a squashed or mirrored part
 * still gets an even line, which a scaled-up clone could not give.
 *
 * Call this once a model is fully assembled: the outline meshes share the
 * geometry they wrap, so anything that later rebuilds that geometry (baking,
 * merging) has to happen first.
 */
export function addOutlines(root: THREE.Object3D, color = INK_COLOR): void {
  const material = inkMaterial(color);

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

/** Tags `mesh`'s geometry and gives it an outline in one step, for one-off props. */
export function inkMesh(mesh: THREE.Mesh, maxWidth: number, color = INK_COLOR): THREE.Mesh {
  tagInk(mesh.geometry, maxWidth);
  addOutlines(mesh, color);
  return mesh;
}
