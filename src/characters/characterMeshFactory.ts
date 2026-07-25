import * as THREE from "three";
import type { CharacterDef } from "./characterData";

export interface CharacterParts {
  root: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D;
  rightArm: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftLeg: THREE.Object3D;
  weapon?: THREE.Object3D;
  extra?: THREE.Object3D; // tail / fin / backpack etc.
}

function mat(color: number, roughness = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08 });
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(r1: number, r2: number, h: number, color: number, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat(color));
  m.castShadow = true;
  return m;
}

function sph(r: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(color));
  m.castShadow = true;
  return m;
}

/**
 * Builds a low-poly, primitive-based character model. All four designs are
 * original silhouettes (no copyrighted assets), only loosely evoking a
 * "plumber", "electric rodent", "speedster" and "cardboard soldier" archetype.
 */
export function createCharacterMesh(def: CharacterDef): CharacterParts {
  switch (def.id) {
    case "jorio":
      return buildJorio(def);
    case "birinezu":
      return buildBirinezu(def);
    case "hayasugi":
      return buildHayasugi(def);
    case "danboru":
      return buildDanboru(def);
  }
}

function buildJorio(def: CharacterDef): CharacterParts {
  const { primary, secondary, accent, skin } = def.palette;
  const root = new THREE.Group();

  const legHeight = 0.55;
  const body = box(0.62, 0.68, 0.4, primary);
  body.position.y = legHeight + 0.34;
  root.add(body);

  const belt = box(0.66, 0.12, 0.42, 0x2b2b2b);
  belt.position.y = legHeight + 0.05;
  root.add(belt);

  const head = new THREE.Group();
  head.position.y = legHeight + 0.68 + 0.28;
  root.add(head);
  const face = sph(0.28, skin);
  head.add(face);
  const cap = cyl(0.3, 0.3, 0.14, primary);
  cap.position.y = 0.2;
  head.add(cap);
  const capBrim = cyl(0.32, 0.32, 0.04, primary);
  capBrim.position.set(0, 0.13, 0.18);
  capBrim.scale.set(1, 1, 0.7);
  head.add(capBrim);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 6), mat(0x3a2a1f));
  beard.position.set(0, -0.2, 0.2);
  beard.rotation.x = Math.PI;
  head.add(beard);

  const rightArm = new THREE.Group();
  rightArm.position.set(-0.42, legHeight + 0.58, 0);
  const rArmMesh = cyl(0.11, 0.1, 0.5, secondary);
  rArmMesh.position.y = -0.25;
  rightArm.add(rArmMesh);
  root.add(rightArm);

  const wrenchHead = box(0.22, 0.12, 0.08, accent);
  wrenchHead.position.set(0, -0.55, 0);
  const wrenchHandle = cyl(0.04, 0.04, 0.4, 0x777777);
  wrenchHandle.position.set(0, -0.35, 0);
  const weapon = new THREE.Group();
  weapon.add(wrenchHandle, wrenchHead);
  rightArm.add(weapon);

  const leftArm = new THREE.Group();
  leftArm.position.set(0.42, legHeight + 0.58, 0);
  const lArmMesh = cyl(0.11, 0.1, 0.5, secondary);
  lArmMesh.position.y = -0.25;
  leftArm.add(lArmMesh);
  root.add(leftArm);

  const rightLeg = cyl(0.13, 0.13, legHeight, secondary);
  rightLeg.position.set(-0.16, legHeight / 2, 0);
  root.add(rightLeg);
  const leftLeg = cyl(0.13, 0.13, legHeight, secondary);
  leftLeg.position.set(0.16, legHeight / 2, 0);
  root.add(leftLeg);

  return { root, body, head, rightArm, leftArm, rightLeg, leftLeg, weapon };
}

function buildBirinezu(def: CharacterDef): CharacterParts {
  const { primary, secondary, accent } = def.palette;
  const root = new THREE.Group();

  const legHeight = 0.28;
  const body = sph(0.36, primary);
  body.scale.set(1, 0.85, 1.1);
  body.position.y = legHeight + 0.34;
  root.add(body);

  const belly = sph(0.24, 0xfff6c9);
  belly.scale.set(0.9, 0.8, 0.6);
  belly.position.set(0, legHeight + 0.26, 0.24);
  root.add(belly);

  const socketMark = box(0.14, 0.2, 0.02, secondary);
  socketMark.position.set(0, legHeight + 0.4, -0.33);
  root.add(socketMark);

  const head = new THREE.Group();
  head.position.y = legHeight + 0.72;
  root.add(head);
  const face = sph(0.24, primary);
  head.add(face);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), mat(accent, 0.3));
  earL.position.set(-0.16, 0.22, 0);
  earL.rotation.z = 0.3;
  const earR = earL.clone();
  earR.position.x = 0.16;
  earR.rotation.z = -0.3;
  head.add(earL, earR);
  (earL.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(accent);
  (earL.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
  (earR.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(accent);
  (earR.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;

  const rightArm = new THREE.Group();
  rightArm.position.set(-0.34, legHeight + 0.44, 0);
  const rArmMesh = sph(0.11, primary);
  rightArm.add(rArmMesh);
  root.add(rightArm);

  const leftArm = new THREE.Group();
  leftArm.position.set(0.34, legHeight + 0.44, 0);
  const lArmMesh = sph(0.11, primary);
  leftArm.add(lArmMesh);
  root.add(leftArm);

  const rightLeg = cyl(0.1, 0.1, legHeight, secondary);
  rightLeg.position.set(-0.14, legHeight / 2, 0);
  root.add(rightLeg);
  const leftLeg = cyl(0.1, 0.1, legHeight, secondary);
  leftLeg.position.set(0.14, legHeight / 2, 0);
  root.add(leftLeg);

  // cord-like tail made of a few chained segments
  const tail = new THREE.Group();
  const segCount = 5;
  let prev = tail;
  for (let i = 0; i < segCount; i++) {
    const seg = cyl(0.045, 0.045, 0.22, secondary, 6);
    seg.position.y = i === 0 ? 0 : -0.2;
    seg.rotation.z = Math.sin(i) * 0.35;
    prev.add(seg);
    const holder = new THREE.Group();
    holder.position.y = -0.22;
    seg.add(holder);
    prev = holder;
  }
  const tailTip = box(0.09, 0.09, 0.03, 0x222222);
  prev.add(tailTip);
  tail.position.set(0, legHeight + 0.4, -0.3);
  tail.rotation.x = 0.6;
  root.add(tail);

  return { root, body, head, rightArm, leftArm, rightLeg, leftLeg, extra: tail };
}

function buildHayasugi(def: CharacterDef): CharacterParts {
  const { primary, secondary, accent, skin } = def.palette;
  const root = new THREE.Group();

  const legHeight = 0.62;
  const body = box(0.46, 0.62, 0.32, primary);
  body.position.y = legHeight + 0.31;
  root.add(body);

  const chest = box(0.3, 0.2, 0.34, accent);
  chest.position.y = legHeight + 0.5;
  root.add(chest);

  const head = new THREE.Group();
  head.position.y = legHeight + 0.62 + 0.26;
  root.add(head);
  const face = sph(0.22, skin);
  head.add(face);
  const goggle = box(0.32, 0.09, 0.06, 0x142033);
  goggle.position.set(0, 0.02, 0.19);
  head.add(goggle);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 4), mat(secondary, 0.3));
  fin.rotation.x = Math.PI / 2.2;
  fin.position.set(0, 0.12, -0.22);
  head.add(fin);

  const rightArm = new THREE.Group();
  rightArm.position.set(-0.32, legHeight + 0.55, 0);
  const rArmMesh = cyl(0.09, 0.08, 0.46, primary);
  rArmMesh.position.y = -0.23;
  rightArm.add(rArmMesh);
  root.add(rightArm);

  const leftArm = new THREE.Group();
  leftArm.position.set(0.32, legHeight + 0.55, 0);
  const lArmMesh = cyl(0.09, 0.08, 0.46, primary);
  lArmMesh.position.y = -0.23;
  leftArm.add(lArmMesh);
  root.add(leftArm);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(-0.14, legHeight, 0);
  const rLegMesh = cyl(0.11, 0.1, legHeight, secondary);
  rLegMesh.position.y = -legHeight / 2;
  rightLeg.add(rLegMesh);
  const rJet = cyl(0.07, 0.09, 0.16, accent);
  rJet.position.set(0, -legHeight + 0.05, -0.08);
  rJet.rotation.x = Math.PI / 2;
  rightLeg.add(rJet);
  root.add(rightLeg);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(0.14, legHeight, 0);
  const lLegMesh = cyl(0.11, 0.1, legHeight, secondary);
  lLegMesh.position.y = -legHeight / 2;
  leftLeg.add(lLegMesh);
  const lJet = cyl(0.07, 0.09, 0.16, accent);
  lJet.position.set(0, -legHeight + 0.05, -0.08);
  lJet.rotation.x = Math.PI / 2;
  leftLeg.add(lJet);
  root.add(leftLeg);

  return { root, body, head, rightArm, leftArm, rightLeg, leftLeg, extra: fin };
}

function buildDanboru(def: CharacterDef): CharacterParts {
  const { primary, secondary, accent } = def.palette;
  const root = new THREE.Group();

  const legHeight = 0.5;
  const body = box(0.7, 0.72, 0.5, primary);
  body.position.y = legHeight + 0.36;
  root.add(body);

  const flapL = box(0.34, 0.18, 0.06, secondary);
  flapL.position.set(-0.2, legHeight + 0.68, 0.2);
  flapL.rotation.z = 0.35;
  const flapR = box(0.34, 0.18, 0.06, secondary);
  flapR.position.set(0.2, legHeight + 0.68, 0.2);
  flapR.rotation.z = -0.35;
  root.add(flapL, flapR);

  const backpack = box(0.4, 0.4, 0.2, secondary);
  backpack.position.set(0, legHeight + 0.4, -0.3);
  root.add(backpack);

  const head = new THREE.Group();
  head.position.y = legHeight + 0.72 + 0.24;
  root.add(head);
  const faceBox = box(0.4, 0.36, 0.36, primary);
  head.add(faceBox);
  const eyeSlit = box(0.28, 0.06, 0.02, accent);
  eyeSlit.position.set(0, 0.02, 0.19);
  head.add(eyeSlit);

  const rightArm = new THREE.Group();
  rightArm.position.set(-0.44, legHeight + 0.58, 0);
  const rArmMesh = box(0.16, 0.5, 0.16, secondary);
  rArmMesh.position.y = -0.25;
  rightArm.add(rArmMesh);
  root.add(rightArm);

  const shovelHead = box(0.16, 0.2, 0.03, accent);
  shovelHead.position.set(0, -0.55, 0.05);
  const shovelHandle = cyl(0.03, 0.03, 0.32, 0x5a4a2f);
  shovelHandle.position.set(0, -0.4, 0);
  const weapon = new THREE.Group();
  weapon.add(shovelHandle, shovelHead);
  rightArm.add(weapon);

  const leftArm = new THREE.Group();
  leftArm.position.set(0.44, legHeight + 0.58, 0);
  const lArmMesh = box(0.16, 0.5, 0.16, secondary);
  lArmMesh.position.y = -0.25;
  leftArm.add(lArmMesh);
  root.add(leftArm);

  const rightLeg = box(0.2, legHeight, 0.22, secondary);
  rightLeg.position.set(-0.18, legHeight / 2, 0);
  root.add(rightLeg);
  const leftLeg = box(0.2, legHeight, 0.22, secondary);
  leftLeg.position.set(0.18, legHeight / 2, 0);
  root.add(leftLeg);

  return { root, body, head, rightArm, leftArm, rightLeg, leftLeg, weapon, extra: backpack };
}
