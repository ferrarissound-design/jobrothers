import * as THREE from "three";
import type { CharacterDef } from "./characterData";
import { addOutlines, bakeLimb, bakeStatic, humanProportions, ModelKit, noShadow, type Limb } from "./meshKit";

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

/** Widest ink line on a fighter, as a fraction of its height. */
const INK_SCALE = 0.0045;

/**
 * Builds a character model out of Three.js primitives — no external assets.
 *
 * Every fighter is assembled on a stylised skeleton scaled to its
 * `stats.height`, with capsule limbs that pivot at the shoulder and hip and
 * bend at the elbow and knee, so the walk and swing animations move joints that
 * actually exist. The designs stay original silhouettes that only evoke a
 * "plumber", "electric rodent", "speedster" and "cardboard soldier" archetype.
 *
 * The styling target is TV animation rather than realism: roughly six heads
 * tall, oversized eyes, hair in flat clumps with a highlight band, cel-stepped
 * shading and an ink outline around every mesh (added here, after baking, so
 * the merge step cannot swallow the outline copies).
 *
 * Arms and legs are named from the character's own point of view: the right
 * limb sits on -X, which is screen-left while the fighter faces the camera.
 */
export function createCharacterMesh(def: CharacterDef): CharacterParts {
  const parts = buildParts(def);
  addOutlines(parts.root);
  return parts;
}

function buildParts(def: CharacterDef): CharacterParts {
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

/** Mirrors a limb built for the right side onto the left. */
function mirrorLimb(limb: Limb): void {
  limb.root.scale.x *= -1;
}

// ---------------------------------------------------------------------------
// ジョリオ — stocky handyman: work shirt, denim overalls, cap, pipe wrench.
// ---------------------------------------------------------------------------

function buildJorio(def: CharacterDef): CharacterParts {
  const kit = new ModelKit(def.stats.height * INK_SCALE);
  const { primary, secondary, accent, skin } = def.palette;
  const hair = 0x4a3222;
  const hairLit = 0x7d5a3c;
  const glove = 0xe4ded2;
  const boot = 0x4a3524;

  const H = def.stats.height;
  const p = humanProportions(H);
  const root = new THREE.Group();

  // --- torso (local origin at the hip joint) ---
  const body = new THREE.Group();
  body.position.y = p.hip;
  root.add(body);

  const pelvis = kit.sphere(H * 0.112, secondary, "denim");
  pelvis.scale.set(0.98, 0.66, 0.8);
  pelvis.position.y = 0.02;
  body.add(pelvis);

  const abdomen = kit.sphere(H * 0.116, primary, "cloth");
  abdomen.scale.set(0.94, 0.82, 0.72);
  abdomen.position.y = p.waist - p.hip + 0.01;
  body.add(abdomen);

  const chest = kit.sphere(H * 0.128, primary, "cloth");
  chest.scale.set(0.98, 0.84, 0.7);
  chest.position.y = p.chest - p.hip + 0.03;
  body.add(chest);

  const traps = kit.sphere(H * 0.115, primary, "cloth", 12);
  traps.scale.set(1.12, 0.42, 0.66);
  traps.position.y = p.shoulder - p.hip - 0.01;
  body.add(traps);

  // denim bib + straps over the shirt
  const bibTop = p.chest - p.hip + H * 0.075;
  const bib = kit.box(H * 0.13, H * 0.19, 0.02, secondary, "denim");
  bib.position.set(0, bibTop - H * 0.095, H * 0.086);
  body.add(noShadow(bib));

  for (const side of [-1, 1]) {
    const strap = kit.box(H * 0.03, H * 0.075, 0.02, secondary, "denim");
    strap.position.set(side * H * 0.05, bibTop + H * 0.025, H * 0.076);
    strap.rotation.x = -0.3;
    body.add(noShadow(strap));

    const buckle = kit.box(H * 0.026, H * 0.022, 0.014, accent, "metal");
    buckle.position.set(side * H * 0.05, bibTop - H * 0.005, H * 0.094);
    body.add(noShadow(buckle));

    // straps cross over on the back, the way real overalls are cut
    const backStrap = kit.box(H * 0.03, H * 0.2, 0.02, secondary, "denim");
    backStrap.position.set(0, p.chest - p.hip + H * 0.02, -H * 0.078);
    backStrap.rotation.z = side * 0.42;
    body.add(noShadow(backStrap));
  }

  const belt = kit.cylinder(H * 0.108, H * 0.108, H * 0.038, 0x2f2721, "leather", 16, true);
  belt.scale.set(1, 1, 0.76);
  belt.position.y = p.waist - p.hip - 0.04;
  body.add(noShadow(belt));

  const buckleMain = kit.box(H * 0.04, H * 0.032, 0.016, accent, "metal");
  buckleMain.position.set(0, p.waist - p.hip - 0.04, H * 0.086);
  body.add(noShadow(buckleMain));

  const neck = kit.cylinder(H * 0.03, H * 0.034, H * 0.05, skin, "skin", 10);
  neck.position.y = p.neck - p.hip - 0.02;
  body.add(neck);

  // --- head (a sixth of the figure, the animation proportion) ---
  const headY = (p.chin + p.crown) / 2;
  const r = H * 0.082;
  const head = new THREE.Group();
  head.position.y = headY;
  root.add(head);

  const skull = kit.sphere(r, skin, "skin", 16);
  skull.scale.set(0.94, 1, 0.92);
  head.add(skull);

  // tapered chin — the jaw narrows instead of squaring off
  const jaw = kit.sphere(r * 0.66, skin, "skin", 12);
  jaw.scale.set(0.82, 0.6, 0.9);
  jaw.position.set(0, -r * 0.46, r * 0.14);
  head.add(noShadow(jaw));

  const backHair = kit.sphere(r * 1.03, hair, "fur", 14);
  backHair.scale.set(0.96, 0.88, 0.92);
  backHair.position.set(0, -r * 0.08, -r * 0.1);
  head.add(noShadow(backHair));

  // the flat highlight band cels paint across hair
  const hairShine = kit.shell(r * 1.06, hairLit, "fur", {
    phiStart: Math.PI * 0.62,
    phiLength: Math.PI * 0.76,
    thetaStart: Math.PI * 0.3,
    thetaLength: Math.PI * 0.12,
    seg: 14,
  });
  hairShine.scale.copy(backHair.scale);
  hairShine.position.copy(backHair.position);
  head.add(noShadow(hairShine));

  const nose = kit.sphere(r * 0.16, skin, "skin", 10);
  nose.scale.set(0.85, 0.95, 1.2);
  nose.position.set(0, -r * 0.22, r * 0.84);
  head.add(noShadow(nose));

  // an inked smile rather than a slot cut in the face
  const mouth = kit.torusArc(r * 0.14, r * 0.03, Math.PI, 0x6a3630, "skin");
  mouth.rotation.set(0, 0, Math.PI);
  mouth.position.set(0, -r * 0.52, r * 0.78);
  head.add(noShadow(mouth));

  for (const side of [-1, 1]) {
    const eye = kit.eye(r * 0.22, 0x3f7a44);
    eye.position.set(side * r * 0.4, -r * 0.08, r * 0.74);
    eye.rotation.y = side * 0.24;
    head.add(eye);

    // thin, angled brow — the whole expression rides on it
    const brow = kit.box(r * 0.38, r * 0.07, r * 0.08, hair, "fur");
    brow.position.set(side * r * 0.4, r * 0.3, r * 0.76);
    brow.rotation.z = side * -0.2;
    head.add(noShadow(brow));

    const ear = kit.sphere(r * 0.24, skin, "skin", 8);
    ear.scale.set(0.38, 1, 0.7);
    ear.position.set(side * r * 0.9, -r * 0.16, -r * 0.02);
    head.add(noShadow(ear));

    // moustache: one flat clump per side, swept out from under the nose
    const stache = kit.sphere(r * 0.17, hair, "fur", 10);
    stache.scale.set(1.5, 0.42, 0.5);
    stache.rotation.z = side * 0.3;
    stache.position.set(side * r * 0.19, -r * 0.38, r * 0.78);
    head.add(noShadow(stache));

    // sideburn clump hanging in front of the ear
    const sideburn = kit.cone(r * 0.16, r * 0.34, hair, "fur", 4);
    sideburn.scale.set(0.55, 1, 0.9);
    sideburn.position.set(side * r * 0.76, -r * 0.1, r * 0.12);
    sideburn.rotation.set(0, 0, Math.PI + side * 0.16);
    head.add(noShadow(sideburn));

    // fringe: two clumps of hair escaping from under the cap band
    for (let i = 0; i < 2; i++) {
      const spike = kit.cone(r * 0.15, r * 0.3, hair, "fur", 4);
      spike.scale.set(1, 1, 0.55);
      spike.position.set(side * r * (0.52 + i * 0.24), r * 0.3, r * (0.68 - i * 0.22));
      spike.rotation.set(0, side * i * 0.5, Math.PI + side * (0.3 + i * 0.2));
      head.add(noShadow(spike));
    }
  }

  // The cap rides high and its brim tips up: a brim angled down for realism
  // shades out the eyes, and with eyes this size that costs the whole face.
  // The cap is kept out of the shadow pass: a hard shadow map edge dropped
  // across the eyes is exactly the modelling anime never does to a face.
  const cap = kit.dome(r * 1.05, primary, "cloth", 16);
  cap.scale.set(0.95, 0.72, 1);
  cap.position.y = r * 0.46;
  head.add(noShadow(cap));

  // sweatband hides the dome's cut edge
  const capBand = kit.cylinder(r * 1.06, r * 1.06, r * 0.16, primary, "cloth", 16, true);
  capBand.scale.set(0.95, 1, 1);
  capBand.position.y = r * 0.46;
  head.add(noShadow(capBand));

  const brim = kit.halfDisc(r * 0.9, r * 0.07, primary, "cloth", 16);
  brim.scale.set(1.06, 1, 1.5);
  brim.position.set(0, r * 0.44, r * 0.36);
  brim.rotation.x = 0.12;
  head.add(noShadow(brim));

  const emblem = kit.cylinder(r * 0.24, r * 0.24, r * 0.06, accent, "plastic", 12);
  emblem.rotation.x = Math.PI / 2;
  emblem.position.set(0, r * 0.74, r * 0.72);
  head.add(noShadow(emblem));

  // --- limbs ---
  const armUpper = H * 0.175;
  const armLower = H * 0.15;
  const arms: Limb[] = [];
  for (const side of [-1, 1]) {
    const arm = kit.limb({
      upperLength: armUpper,
      upperRadius: H * 0.036,
      lowerLength: armLower,
      lowerRadius: H * 0.031,
      color: primary,
      surface: "cloth",
      lowerColor: skin,
      lowerSurface: "skin",
      bend: -0.3,
    });
    arm.root.position.set(side * H * 0.117, p.shoulder, 0);
    arm.root.rotation.z = side * 0.1;

    const hand = kit.sphere(H * 0.036, glove, "leather", 10);
    hand.scale.set(0.85, 1.05, 0.95);
    hand.position.y = -H * 0.026;
    arm.tip.add(hand);

    // rolled-up sleeve cuff where the shirt ends at the elbow
    const cuff = kit.cylinder(H * 0.04, H * 0.038, H * 0.028, primary, "cloth", 10);
    cuff.position.y = -armUpper * 0.9;
    arm.root.add(noShadow(cuff));

    root.add(arm.root);
    arms.push(arm);
  }
  const rightArm = arms[0];
  const leftArm = arms[1];
  mirrorLimb(leftArm);

  const thigh = p.hip - p.knee;
  const shin = p.knee - p.ankle;
  const legs: Limb[] = [];
  for (const side of [-1, 1]) {
    const leg = kit.limb({
      upperLength: thigh,
      upperRadius: H * 0.05,
      lowerLength: shin,
      lowerRadius: H * 0.04,
      color: secondary,
      surface: "denim",
      lowerColor: secondary,
      bend: 0.1,
    });
    leg.root.position.set(side * H * 0.055, p.hip, 0);

    const bootShaft = kit.cylinder(H * 0.048, H * 0.045, H * 0.09, boot, "leather", 10);
    bootShaft.position.y = -H * 0.03;
    leg.tip.add(bootShaft);

    const foot = kit.box(H * 0.062, H * 0.042, H * 0.115, boot, "leather");
    foot.position.set(0, -H * 0.06, H * 0.028);
    leg.tip.add(foot);

    const sole = kit.box(H * 0.066, H * 0.016, H * 0.12, 0x24201c, "rubber");
    sole.position.set(0, -H * 0.078, H * 0.028);
    leg.tip.add(noShadow(sole));

    root.add(leg.root);
    legs.push(leg);
  }
  const rightLeg = legs[0];
  const leftLeg = legs[1];
  mirrorLimb(leftLeg);

  bakeStatic(body);
  bakeStatic(head);
  [rightArm, leftArm, rightLeg, leftLeg].forEach(bakeLimb);

  // --- pipe wrench, held in the right hand ---
  const weapon = new THREE.Group();
  const handle = kit.capsule(H * 0.014, H * 0.2, 0x8f979f, "metal", 10);
  handle.position.y = -H * 0.09;
  weapon.add(handle);

  const grip = kit.cylinder(H * 0.018, H * 0.018, H * 0.06, 0x2b2b2b, "rubber", 10);
  grip.position.y = -H * 0.035;
  weapon.add(noShadow(grip));

  const jawRing = kit.torusArc(H * 0.034, H * 0.012, Math.PI * 1.45, 0x8f979f, "metal");
  jawRing.rotation.z = -0.7;
  jawRing.position.y = -H * 0.21;
  weapon.add(jawRing);

  const jawBlock = kit.box(H * 0.05, H * 0.03, H * 0.024, 0x6f767d, "metal");
  jawBlock.position.y = -H * 0.166;
  weapon.add(noShadow(jawBlock));

  weapon.rotation.x = -0.25;
  weapon.position.y = -H * 0.05;
  bakeStatic(weapon);
  rightArm.tip.add(weapon);

  return {
    root,
    body,
    head,
    rightArm: rightArm.root,
    leftArm: leftArm.root,
    rightLeg: rightLeg.root,
    leftLeg: leftLeg.root,
    weapon,
  };
}

// ---------------------------------------------------------------------------
// ビリネズ — small electric rodent: fur, snout, spark cheeks, power-cord tail.
// ---------------------------------------------------------------------------

function buildBirinezu(def: CharacterDef): CharacterParts {
  const kit = new ModelKit(def.stats.height * INK_SCALE);
  const { primary, secondary, accent } = def.palette;
  const cream = 0xfff3c4;
  const innerEar = 0xd88f8f;
  const claw = 0xefe6cf;

  const H = def.stats.height;
  const hipY = H * 0.38;
  const root = new THREE.Group();

  // --- torso ---
  const body = new THREE.Group();
  body.position.y = hipY;
  root.add(body);

  const haunches = kit.sphere(H * 0.15, primary, "fur", 14);
  haunches.scale.set(1, 0.82, 1.05);
  haunches.position.y = H * 0.04;
  body.add(haunches);

  const chestR = H * 0.16;
  const chest = kit.sphere(chestR, primary, "fur", 16);
  chest.scale.set(0.96, 1.06, 1);
  chest.position.y = H * 0.17;
  body.add(chest);

  // cream belly, laid on the body surface as a shell so it cannot z-fight
  const belly = kit.shell(chestR * 1.015, cream, "fur", {
    phiStart: Math.PI / 2 - 0.72,
    phiLength: 1.44,
    thetaStart: Math.PI * 0.32,
    thetaLength: Math.PI * 0.52,
    seg: 16,
  });
  belly.scale.copy(chest.scale);
  belly.position.copy(chest.position);
  body.add(noShadow(belly));

  // two-pin socket marking on the back
  for (const side of [-1, 1]) {
    const pin = kit.box(H * 0.02, H * 0.05, 0.012, secondary, "rubber");
    pin.position.set(side * H * 0.032, H * 0.2, -H * 0.15);
    body.add(noShadow(pin));
  }

  // --- head ---
  const head = new THREE.Group();
  head.position.y = H * 0.74;
  root.add(head);

  const r = H * 0.17;
  const skull = kit.sphere(r, primary, "fur", 16);
  skull.scale.set(1, 0.95, 1);
  head.add(skull);

  const snout = kit.sphere(r * 0.62, primary, "fur", 12);
  snout.scale.set(0.82, 0.66, 1.05);
  snout.position.set(0, -r * 0.34, r * 0.72);
  head.add(noShadow(snout));

  const nose = kit.sphere(r * 0.17, 0x241d1a, "plastic", 8);
  nose.scale.set(1.15, 0.85, 0.9);
  nose.position.set(0, -r * 0.28, r * 1.14);
  head.add(noShadow(nose));

  const mouth = kit.torusArc(r * 0.2, r * 0.035, Math.PI, 0x241d1a, "plastic");
  mouth.rotation.set(0, 0, Math.PI);
  mouth.position.set(0, -r * 0.46, r * 1.02);
  head.add(noShadow(mouth));

  for (const side of [-1, 1]) {
    // mascot eyes: nearly all pupil, with the big catch light the kit draws
    const eye = kit.eye(r * 0.3, 0x3b2418, 0x120c08);
    eye.position.set(side * r * 0.46, r * 0.14, r * 0.78);
    eye.rotation.y = side * 0.3;
    head.add(eye);

    // spark cheek
    const cheek = kit.sphere(r * 0.33, accent, "glow", 10);
    cheek.scale.set(1, 1, 0.5);
    cheek.position.set(side * r * 0.76, -r * 0.36, r * 0.5);
    head.add(noShadow(cheek));

    // whiskers
    for (let i = 0; i < 3; i++) {
      const whisker = kit.cylinder(0.004, 0.002, r * 0.9, 0x3c3428, "fur", 4);
      whisker.rotation.set(0, 0, side * (Math.PI / 2 - 0.15));
      whisker.rotation.x = (i - 1) * 0.18;
      whisker.position.set(side * (r * 0.95 + r * 0.45), -r * 0.06 + (i - 1) * r * 0.12, r * 0.58);
      head.add(noShadow(whisker));
    }

    // rounded ear with a charged tip
    const ear = new THREE.Group();
    ear.position.set(side * r * 0.6, r * 0.78, -r * 0.02);
    ear.rotation.z = side * 0.34;
    head.add(ear);

    const earShell = kit.sphere(r * 0.6, primary, "fur", 12);
    earShell.scale.set(0.82, 1.15, 0.3);
    ear.add(earShell);

    const earInner = kit.sphere(r * 0.6, innerEar, "fur", 10);
    earInner.scale.set(0.56, 0.92, 0.28);
    earInner.position.z = r * 0.05;
    ear.add(noShadow(earInner));

    const earTip = kit.sphere(r * 0.34, accent, "glow", 8);
    earTip.scale.set(0.78, 0.6, 0.34);
    earTip.position.y = r * 0.56;
    ear.add(noShadow(earTip));
  }

  // --- limbs ---
  const arms: Limb[] = [];
  for (const side of [-1, 1]) {
    const arm = kit.limb({
      upperLength: H * 0.1,
      upperRadius: H * 0.045,
      lowerLength: H * 0.09,
      lowerRadius: H * 0.038,
      color: primary,
      surface: "fur",
      bend: -0.45,
    });
    arm.root.position.set(side * H * 0.17, H * 0.6, H * 0.02);
    arm.root.rotation.z = side * 0.55;

    const paw = kit.sphere(H * 0.045, primary, "fur", 10);
    paw.scale.set(0.95, 0.85, 1.05);
    paw.position.y = -H * 0.022;
    arm.tip.add(paw);

    for (let i = -1; i <= 1; i++) {
      const nail = kit.cone(H * 0.008, H * 0.024, claw, "plastic", 6);
      nail.rotation.x = -2.5;
      nail.position.set(i * H * 0.022, -H * 0.04, H * 0.03);
      arm.tip.add(noShadow(nail));
    }

    root.add(arm.root);
    arms.push(arm);
  }
  mirrorLimb(arms[1]);

  const legs: Limb[] = [];
  for (const side of [-1, 1]) {
    const leg = kit.limb({
      upperLength: H * 0.18,
      upperRadius: H * 0.062,
      lowerLength: H * 0.12,
      lowerRadius: H * 0.045,
      color: primary,
      surface: "fur",
      lowerColor: secondary,
      bend: 0.5,
    });
    leg.root.position.set(side * H * 0.095, hipY, 0);

    const foot = kit.sphere(H * 0.055, secondary, "fur", 10);
    foot.scale.set(0.9, 0.55, 1.5);
    foot.position.set(0, -H * 0.018, H * 0.03);
    leg.tip.add(foot);

    for (let i = -1; i <= 1; i++) {
      const nail = kit.cone(H * 0.009, H * 0.026, claw, "plastic", 6);
      nail.rotation.x = -Math.PI / 2;
      nail.position.set(i * H * 0.024, -H * 0.022, H * 0.1);
      leg.tip.add(noShadow(nail));
    }

    root.add(leg.root);
    legs.push(leg);
  }
  mirrorLimb(legs[1]);

  // --- power-cord tail ending in a two-pin plug ---
  const tail = new THREE.Group();
  tail.position.set(0, hipY + H * 0.1, -H * 0.13);
  tail.rotation.x = -1.3; // sweeps back from the rump, then curls upward
  root.add(tail);

  let attach: THREE.Object3D = tail;
  const segLength = H * 0.105;
  for (let i = 0; i < 5; i++) {
    const seg = kit.capsule(H * 0.024, segLength, secondary, "rubber", 8);
    seg.position.y = segLength * 0.5;
    attach.add(seg);

    const next = new THREE.Group();
    next.position.y = segLength;
    next.rotation.x = 0.13;
    next.rotation.z = Math.sin(i * 1.7) * 0.14;
    attach.add(next);
    attach = next;
  }

  const plugBody = kit.box(H * 0.075, H * 0.07, H * 0.05, cream, "plastic");
  plugBody.position.y = H * 0.03;
  attach.add(plugBody);

  for (const side of [-1, 1]) {
    const prong = kit.box(H * 0.014, H * 0.055, H * 0.008, 0xb9c0c6, "metal");
    prong.position.set(side * H * 0.02, H * 0.09, 0);
    attach.add(noShadow(prong));
  }

  bakeStatic(body);
  bakeStatic(head);
  bakeStatic(tail);
  [...arms, ...legs].forEach(bakeLimb);

  return {
    root,
    body,
    head,
    rightArm: arms[0].root,
    leftArm: arms[1].root,
    rightLeg: legs[0].root,
    leftLeg: legs[1].root,
    extra: tail,
  };
}

// ---------------------------------------------------------------------------
// ハヤスギ — lean sprinter in an aero racing suit with a visored helmet.
// ---------------------------------------------------------------------------

function buildHayasugi(def: CharacterDef): CharacterParts {
  const kit = new ModelKit(def.stats.height * INK_SCALE);
  const { primary, secondary, accent, skin } = def.palette;
  const thrust = 0x9fd8ff;

  const H = def.stats.height;
  const p = humanProportions(H);
  const root = new THREE.Group();

  // --- torso ---
  const body = new THREE.Group();
  body.position.y = p.hip;
  root.add(body);

  const pelvis = kit.sphere(H * 0.092, primary, "cloth");
  pelvis.scale.set(1, 0.68, 0.78);
  pelvis.position.y = 0.02;
  body.add(pelvis);

  const abdomen = kit.sphere(H * 0.094, primary, "cloth");
  abdomen.scale.set(0.94, 0.9, 0.68);
  abdomen.position.y = p.waist - p.hip + 0.01;
  body.add(abdomen);

  const chestR = H * 0.112;
  const chest = kit.sphere(chestR, primary, "cloth");
  chest.scale.set(1, 0.92, 0.66);
  chest.position.y = p.chest - p.hip + 0.03;
  body.add(chest);

  const traps = kit.sphere(H * 0.1, primary, "cloth", 12);
  traps.scale.set(1.06, 0.42, 0.64);
  traps.position.y = p.shoulder - p.hip - 0.01;
  body.add(traps);

  // chest bib, centre stripe and flank panels are laid onto the suit as shells
  const bib = kit.shell(chestR * 1.015, secondary, "cloth", {
    phiStart: Math.PI / 2 - 0.45,
    phiLength: 0.9,
    thetaStart: Math.PI * 0.24,
    thetaLength: Math.PI * 0.3,
    seg: 16,
  });
  bib.scale.copy(chest.scale);
  bib.position.copy(chest.position);
  body.add(noShadow(bib));

  const centreStripe = kit.shell(chestR * 1.025, accent, "plastic", {
    phiStart: Math.PI / 2 - 0.08,
    phiLength: 0.16,
    thetaStart: Math.PI * 0.2,
    thetaLength: Math.PI * 0.42,
    seg: 8,
  });
  centreStripe.scale.copy(chest.scale);
  centreStripe.position.copy(chest.position);
  body.add(noShadow(centreStripe));

  for (const side of [-1, 1]) {
    const panel = kit.shell(chestR * 1.012, accent, "cloth", {
      phiStart: side < 0 ? Math.PI - 0.35 : -0.35,
      phiLength: 0.7,
      thetaStart: Math.PI * 0.3,
      thetaLength: Math.PI * 0.45,
      seg: 14,
    });
    panel.scale.copy(chest.scale);
    panel.position.copy(chest.position);
    body.add(noShadow(panel));
  }

  const waistBand = kit.cylinder(H * 0.09, H * 0.09, H * 0.03, accent, "plastic", 14, true);
  waistBand.scale.set(1, 1, 0.74);
  waistBand.position.y = p.waist - p.hip - 0.03;
  body.add(noShadow(waistBand));

  const stripe = kit.box(H * 0.018, H * 0.13, 0.01, secondary, "cloth");
  stripe.position.set(0, p.waist - p.hip, H * 0.062);
  body.add(noShadow(stripe));

  const collar = kit.cylinder(H * 0.038, H * 0.044, H * 0.038, accent, "plastic", 12);
  collar.position.y = p.neck - p.hip - 0.02;
  body.add(collar);

  // --- helmet ---
  const headY = (p.chin + p.crown) / 2;
  const r = H * 0.08;
  const head = new THREE.Group();
  head.position.y = headY;
  root.add(head);

  const jaw = kit.sphere(r * 0.68, skin, "skin", 12);
  jaw.scale.set(0.8, 0.74, 0.92);
  jaw.position.set(0, -r * 0.52, r * 0.12);
  head.add(jaw);

  const helmet = kit.sphere(r, primary, "plastic", 16);
  helmet.scale.set(0.96, 1.04, 1.02);
  head.add(helmet);

  const visor = kit.shell(r * 1.03, 0x0d1c33, "visor", {
    phiStart: -0.25,
    phiLength: Math.PI + 0.5,
    thetaStart: Math.PI * 0.36,
    thetaLength: Math.PI * 0.28,
    seg: 18,
  });
  visor.scale.set(0.98, 1.04, 1.04);
  head.add(noShadow(visor));

  // eyes read through the visor as two lit slits — the mecha-pilot convention
  for (const side of [-1, 1]) {
    const glowEye = kit.sphere(r * 0.3, 0x9ff4ff, "glow", 10);
    glowEye.scale.set(1.35, 0.62, 0.22);
    glowEye.position.set(side * r * 0.38, -r * 0.02, r * 0.95);
    glowEye.rotation.z = side * 0.26;
    head.add(noShadow(glowEye));
  }

  // the pair of slanted highlight streaks a cel painter puts on a visor: narrow
  // bands lifted off the helmet surface, then tipped over so they run diagonally
  for (const [offset, width] of [
    [0.62, 0.13],
    [0.4, 0.06],
  ]) {
    const streak = kit.shell(r * 1.05, 0xdff1ff, "glow", {
      phiStart: Math.PI / 2 + offset,
      phiLength: width,
      thetaStart: Math.PI * 0.34,
      thetaLength: Math.PI * 0.22,
      seg: 10,
    });
    streak.scale.set(0.98, 1.04, 1.04);
    streak.rotation.z = -0.5;
    head.add(noShadow(streak));
  }

  const crestBase = kit.shell(r * 1.02, secondary, "plastic", {
    phiStart: -Math.PI / 2 - 0.09,
    phiLength: 0.18,
    thetaStart: 0,
    thetaLength: Math.PI * 0.62,
    seg: 10,
  });
  crestBase.scale.set(0.98, 1.06, 1.04);
  head.add(noShadow(crestBase));

  for (const side of [-1, 1]) {
    const pod = kit.cylinder(r * 0.3, r * 0.3, r * 0.16, accent, "plastic", 12);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(side * r * 0.92, -r * 0.1, -r * 0.06);
    head.add(noShadow(pod));

    const podRing = kit.cylinder(r * 0.16, r * 0.16, r * 0.2, secondary, "plastic", 10);
    podRing.rotation.z = Math.PI / 2;
    podRing.position.set(side * r * 0.98, -r * 0.1, -r * 0.06);
    head.add(noShadow(podRing));
  }

  // swept-back tail fin
  const fin = new THREE.Group();
  fin.position.set(0, r * 0.55, -r * 0.5);
  head.add(fin);
  const finBlade = kit.cone(r * 0.5, r * 2.1, secondary, "plastic", 4);
  finBlade.scale.set(0.3, 1, 1);
  finBlade.rotation.x = -Math.PI / 2 + 0.3;
  finBlade.position.set(0, r * 0.35, -r * 1.0);
  fin.add(finBlade);
  const finEdge = kit.box(r * 0.07, r * 0.09, r * 1.5, accent, "plastic");
  finEdge.rotation.x = -0.5;
  finEdge.position.set(0, r * 0.72, -r * 0.86);
  fin.add(noShadow(finEdge));

  // --- limbs ---
  const armUpper = H * 0.185;
  const armLower = H * 0.155;
  const arms: Limb[] = [];
  for (const side of [-1, 1]) {
    const arm = kit.limb({
      upperLength: armUpper,
      upperRadius: H * 0.03,
      lowerLength: armLower,
      lowerRadius: H * 0.026,
      color: primary,
      surface: "cloth",
      lowerColor: secondary,
      jointColor: accent,
      bend: -0.28,
    });
    arm.root.position.set(side * H * 0.104, p.shoulder, 0);
    arm.root.rotation.z = side * 0.08;

    const pad = kit.shell(H * 0.036, secondary, "plastic", { thetaLength: Math.PI * 0.6, seg: 12 });
    pad.scale.set(1.06, 0.9, 1.06);
    arm.root.add(noShadow(pad));

    const glove = kit.sphere(H * 0.03, accent, "leather", 10);
    glove.scale.set(0.85, 1.1, 0.95);
    glove.position.y = -H * 0.022;
    arm.tip.add(glove);

    // aero fin on the outside of the forearm
    const aero = kit.box(H * 0.008, H * 0.032, H * 0.07, accent, "plastic");
    aero.position.set(side * H * 0.022, -armLower * 0.5, -H * 0.014);
    aero.rotation.x = 0.25;
    arm.joint.add(noShadow(aero));

    root.add(arm.root);
    arms.push(arm);
  }
  mirrorLimb(arms[1]);

  const thigh = p.hip - p.knee;
  const shin = p.knee - p.ankle;
  const legs: Limb[] = [];
  for (const side of [-1, 1]) {
    const leg = kit.limb({
      upperLength: thigh,
      upperRadius: H * 0.045,
      lowerLength: shin,
      lowerRadius: H * 0.034,
      color: primary,
      surface: "cloth",
      lowerColor: secondary,
      jointColor: accent,
      bend: 0.08,
    });
    leg.root.position.set(side * H * 0.05, p.hip, 0);

    const boot = kit.box(H * 0.056, H * 0.05, H * 0.13, accent, "plastic");
    boot.position.set(0, -H * 0.026, H * 0.028);
    leg.tip.add(boot);

    const sole = kit.box(H * 0.06, H * 0.014, H * 0.135, secondary, "rubber");
    sole.position.set(0, -H * 0.05, H * 0.028);
    leg.tip.add(noShadow(sole));

    // heel thruster
    const nozzle = kit.cylinder(H * 0.03, H * 0.022, H * 0.05, 0x9aa3ad, "metal", 10);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, -H * 0.016, -H * 0.06);
    leg.tip.add(nozzle);

    const flame = kit.cylinder(H * 0.019, H * 0.019, H * 0.012, thrust, "glow", 8);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, -H * 0.016, -H * 0.082);
    leg.tip.add(noShadow(flame));

    root.add(leg.root);
    legs.push(leg);
  }
  mirrorLimb(legs[1]);

  bakeStatic(body);
  bakeStatic(head, [fin]);
  bakeStatic(fin);
  [...arms, ...legs].forEach(bakeLimb);

  return {
    root,
    body,
    head,
    rightArm: arms[0].root,
    leftArm: arms[1].root,
    rightLeg: legs[0].root,
    leftLeg: legs[1].root,
    extra: fin,
  };
}

// ---------------------------------------------------------------------------
// ダンボール・ジョー — infiltrator in fatigues under a taped-up cardboard crate.
// ---------------------------------------------------------------------------

function buildDanboru(def: CharacterDef): CharacterParts {
  const kit = new ModelKit(def.stats.height * INK_SCALE);
  const { primary, secondary, accent, skin } = def.palette;
  const suit = skin; // dark bodysuit tone
  const tape = 0xd9cbb0;
  const stencil = 0x6b5533;
  const olive = 0x4f5540;

  const H = def.stats.height;
  const p = humanProportions(H);
  const root = new THREE.Group();

  // --- soldier underneath ---
  const body = new THREE.Group();
  body.position.y = p.hip;
  root.add(body);

  const pelvis = kit.sphere(H * 0.115, suit, "cloth");
  pelvis.scale.set(1, 0.68, 0.8);
  pelvis.position.y = 0.02;
  body.add(pelvis);

  const abdomen = kit.sphere(H * 0.118, suit, "cloth");
  abdomen.scale.set(0.96, 0.86, 0.74);
  abdomen.position.y = p.waist - p.hip + 0.01;
  body.add(abdomen);

  const chest = kit.sphere(H * 0.132, suit, "cloth");
  chest.scale.set(1.02, 0.86, 0.74);
  chest.position.y = p.chest - p.hip + 0.03;
  body.add(chest);

  const vest = kit.sphere(H * 0.134, accent, "cloth", 14);
  vest.scale.set(0.94, 0.72, 0.78);
  vest.position.y = p.chest - p.hip + 0.02;
  body.add(noShadow(vest));

  for (const side of [-1, 1]) {
    const pouch = kit.box(H * 0.055, H * 0.05, H * 0.03, olive, "cloth");
    pouch.position.set(side * H * 0.055, p.chest - p.hip - H * 0.04, H * 0.096);
    body.add(noShadow(pouch));
  }

  const belt = kit.cylinder(H * 0.112, H * 0.112, H * 0.036, 0x2a2a26, "leather", 14, true);
  belt.scale.set(1, 1, 0.8);
  belt.position.y = p.waist - p.hip - 0.04;
  body.add(noShadow(belt));

  // --- cardboard crate worn over the torso ---
  const crateW = H * 0.29;
  const crateH = H * 0.3;
  const crateD = H * 0.24;
  // top edge stops just under the shoulders so the arms stay readable
  const crateY = p.shoulder - p.hip - H * 0.04 - crateH / 2;

  const crate = kit.box(crateW, crateH, crateD, primary, "card");
  crate.position.y = crateY;
  body.add(crate);

  const crateRim = kit.box(crateW * 1.01, H * 0.014, crateD * 1.01, secondary, "card");
  crateRim.position.y = crateY + crateH / 2;
  body.add(noShadow(crateRim));

  // packing tape along the seams
  const tapeV = kit.box(H * 0.05, crateH * 0.98, 0.006, tape, "plastic");
  tapeV.position.set(0, crateY, crateD / 2 + 0.004);
  body.add(noShadow(tapeV));

  const tapeH = kit.box(crateW * 0.99, H * 0.04, 0.006, tape, "plastic");
  tapeH.position.set(0, crateY - crateH * 0.3, crateD / 2 + 0.004);
  body.add(noShadow(tapeH));

  // stencilled "this side up" arrow + shipping label
  const arrowShaft = kit.box(H * 0.014, H * 0.07, 0.005, stencil, "card");
  arrowShaft.position.set(-crateW * 0.3, crateY + crateH * 0.06, crateD / 2 + 0.005);
  body.add(noShadow(arrowShaft));
  for (const side of [-1, 1]) {
    const barb = kit.box(H * 0.012, H * 0.035, 0.005, stencil, "card");
    barb.position.set(-crateW * 0.3 + side * H * 0.013, crateY + crateH * 0.12, crateD / 2 + 0.005);
    barb.rotation.z = side * 0.9;
    body.add(noShadow(barb));
  }

  const label = kit.box(H * 0.085, H * 0.055, 0.005, tape, "card");
  label.position.set(crateW * 0.26, crateY - crateH * 0.04, crateD / 2 + 0.005);
  body.add(noShadow(label));
  for (let i = 0; i < 3; i++) {
    const line = kit.box(H * 0.06, H * 0.006, 0.004, stencil, "card");
    line.position.set(crateW * 0.26, crateY - crateH * 0.04 + (1 - i) * H * 0.015, crateD / 2 + 0.008);
    body.add(noShadow(line));
  }

  // observation slit
  const slit = kit.box(H * 0.17, H * 0.028, 0.008, 0x14120f, "plastic");
  slit.position.set(0, crateY + crateH * 0.3, crateD / 2 + 0.005);
  body.add(noShadow(slit));

  // open flaps
  const flapSpecs: Array<{ w: number; d: number; pos: [number, number, number]; rot: [number, number, number] }> = [
    { w: crateW, d: crateD * 0.5, pos: [0, crateY + crateH / 2 + H * 0.02, crateD * 0.36], rot: [0.85, 0, 0] },
    { w: crateW, d: crateD * 0.5, pos: [0, crateY + crateH / 2 + H * 0.03, -crateD * 0.4], rot: [-1.1, 0, 0] },
    { w: crateD * 0.5, d: crateW, pos: [-crateW * 0.42, crateY + crateH / 2 + H * 0.025, 0], rot: [0, 0, -0.95] },
    { w: crateD * 0.5, d: crateW, pos: [crateW * 0.42, crateY + crateH / 2 + H * 0.025, 0], rot: [0, 0, 0.95] },
  ];
  for (const spec of flapSpecs) {
    const flap = kit.box(spec.w, H * 0.012, spec.d, primary, "card");
    flap.position.set(...spec.pos);
    flap.rotation.set(...spec.rot);
    body.add(flap);
  }

  // --- head: balaclava, helmet, goggles ---
  const headY = (p.chin + p.crown) / 2;
  const r = H * 0.08;
  const head = new THREE.Group();
  head.position.y = headY;
  root.add(head);

  const hood = kit.sphere(r, suit, "cloth", 14);
  hood.scale.set(0.9, 1, 0.95);
  head.add(hood);

  const helmet = kit.dome(r * 1.06, olive, "plastic", 16);
  helmet.scale.set(0.98, 0.92, 1.02);
  helmet.position.y = r * 0.16;
  head.add(noShadow(helmet));

  const helmetBrim = kit.halfDisc(r * 1.12, r * 0.1, olive, "plastic", 14);
  helmetBrim.scale.set(0.98, 1, 1.05);
  helmetBrim.position.set(0, r * 0.22, r * 0.1);
  helmetBrim.rotation.x = 0.1;
  head.add(noShadow(helmetBrim));

  // the strap rides the helmet with the goggles it belongs to
  const goggleStrap = kit.cylinder(r * 1.07, r * 1.07, r * 0.2, 0x24241f, "rubber", 14, true);
  goggleStrap.scale.set(0.98, 1, 1.02);
  goggleStrap.position.y = r * 0.4;
  head.add(noShadow(goggleStrap));

  // Goggles ride up on the helmet so the face underneath stays readable — a
  // fighter the player never sees the eyes of reads as a prop, not a character.
  for (const side of [-1, 1]) {
    const lens = kit.cylinder(r * 0.28, r * 0.28, r * 0.12, accent, "visor", 12);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(side * r * 0.34, r * 0.42, r * 0.93);
    head.add(noShadow(lens));

    const rim = kit.torusArc(r * 0.3, r * 0.05, Math.PI * 2, 0x24241f, "rubber");
    rim.position.set(side * r * 0.34, r * 0.42, r * 0.89);
    head.add(noShadow(rim));

    // painted-on lens glare: the diagonal double streak of a drawn goggle
    for (let i = 0; i < 2; i++) {
      const glare = kit.box(r * 0.06 - i * r * 0.025, r * 0.3 - i * r * 0.1, r * 0.02, 0xf2fbff, "glow");
      glare.position.set(side * r * 0.34 - r * 0.11 + i * r * 0.1, r * 0.44, r * 1.01);
      glare.rotation.z = 0.6;
      head.add(noShadow(glare));
    }

    // sharp pale eyes cut out of the balaclava
    const eye = kit.eye(r * 0.2, 0x9fc7e8, 0x101418);
    eye.position.set(side * r * 0.38, -r * 0.12, r * 0.76);
    eye.rotation.y = side * 0.22;
    head.add(eye);
  }

  const mask = kit.sphere(r * 0.7, 0x2c2c28, "cloth", 10);
  mask.scale.set(0.9, 0.62, 0.86);
  mask.position.set(0, -r * 0.46, r * 0.24);
  head.add(noShadow(mask));

  // --- limbs ---
  const armUpper = H * 0.18;
  const armLower = H * 0.152;
  const arms: Limb[] = [];
  for (const side of [-1, 1]) {
    const arm = kit.limb({
      upperLength: armUpper,
      upperRadius: H * 0.04,
      lowerLength: armLower,
      lowerRadius: H * 0.034,
      color: suit,
      surface: "cloth",
      lowerColor: olive,
      bend: -0.32,
    });
    arm.root.position.set(side * H * 0.15, p.shoulder, 0);
    arm.root.rotation.z = side * 0.14;

    const pad = kit.shell(H * 0.05, olive, "cloth", { thetaLength: Math.PI * 0.6, seg: 12 });
    pad.scale.set(1, 0.85, 1);
    arm.root.add(noShadow(pad));

    const glove = kit.sphere(H * 0.038, 0x22221e, "leather", 10);
    glove.scale.set(0.85, 1.05, 0.95);
    glove.position.y = -H * 0.026;
    arm.tip.add(glove);

    root.add(arm.root);
    arms.push(arm);
  }
  mirrorLimb(arms[1]);

  const thigh = p.hip - p.knee;
  const shin = p.knee - p.ankle;
  const legs: Limb[] = [];
  for (const side of [-1, 1]) {
    const leg = kit.limb({
      upperLength: thigh,
      upperRadius: H * 0.056,
      lowerLength: shin,
      lowerRadius: H * 0.044,
      color: suit,
      surface: "cloth",
      lowerColor: olive,
      bend: 0.1,
    });
    leg.root.position.set(side * H * 0.062, p.hip, 0);

    const kneePad = kit.shell(H * 0.058, 0x2c2c28, "leather", {
      phiStart: 0.2,
      phiLength: Math.PI - 0.4,
      thetaStart: Math.PI * 0.18,
      thetaLength: Math.PI * 0.64,
      seg: 10,
    });
    kneePad.scale.set(1, 1.15, 1);
    leg.joint.add(noShadow(kneePad));

    const bootShaft = kit.cylinder(H * 0.052, H * 0.048, H * 0.11, 0x22221e, "leather", 10);
    bootShaft.position.y = -H * 0.036;
    leg.tip.add(bootShaft);

    const foot = kit.box(H * 0.07, H * 0.046, H * 0.135, 0x22221e, "leather");
    foot.position.set(0, -H * 0.07, H * 0.03);
    leg.tip.add(foot);

    const sole = kit.box(H * 0.074, H * 0.018, H * 0.14, 0x14140f, "rubber");
    sole.position.set(0, -H * 0.09, H * 0.03);
    leg.tip.add(noShadow(sole));

    root.add(leg.root);
    legs.push(leg);
  }
  mirrorLimb(legs[1]);

  // --- backpack ---
  const backpack = new THREE.Group();
  backpack.position.set(0, p.hip + crateY, -crateD * 0.5 - H * 0.07);
  root.add(backpack);

  const packBody = kit.box(H * 0.21, H * 0.24, H * 0.1, olive, "cloth");
  backpack.add(packBody);

  const packLid = kit.box(H * 0.22, H * 0.07, H * 0.11, secondary, "cloth");
  packLid.position.y = H * 0.095;
  backpack.add(noShadow(packLid));

  for (const side of [-1, 1]) {
    const strap = kit.box(H * 0.03, H * 0.24, 0.008, 0x2a2a26, "leather");
    strap.position.set(side * H * 0.075, -H * 0.02, H * 0.065);
    backpack.add(noShadow(strap));
  }

  const bedroll = kit.capsule(H * 0.035, H * 0.26, secondary, "cloth", 10);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, -H * 0.14, H * 0.01);
  backpack.add(noShadow(bedroll));

  bakeStatic(body);
  bakeStatic(head);
  bakeStatic(backpack);
  [...arms, ...legs].forEach(bakeLimb);

  // --- entrenching tool, held in the right hand ---
  const weapon = new THREE.Group();
  const shaft = kit.capsule(H * 0.014, H * 0.22, 0x5a4a2f, "leather", 10);
  shaft.position.y = -H * 0.1;
  weapon.add(shaft);

  const collar = kit.cylinder(H * 0.022, H * 0.022, H * 0.035, 0x9aa3ad, "metal", 10);
  collar.position.y = -H * 0.2;
  weapon.add(noShadow(collar));

  const blade = kit.box(H * 0.09, H * 0.1, H * 0.014, 0x6e767e, "metal");
  blade.position.y = -H * 0.26;
  weapon.add(blade);

  // spade point: a square rotated onto its corner, flush with the blade
  const bladeTip = kit.box(H * 0.064, H * 0.064, H * 0.014, 0x6e767e, "metal");
  bladeTip.rotation.z = Math.PI / 4;
  bladeTip.position.y = -H * 0.3;
  weapon.add(noShadow(bladeTip));

  weapon.rotation.x = -0.2;
  weapon.position.y = -H * 0.045;
  bakeStatic(weapon);
  arms[0].tip.add(weapon);

  return {
    root,
    body,
    head,
    rightArm: arms[0].root,
    leftArm: arms[1].root,
    rightLeg: legs[0].root,
    leftLeg: legs[1].root,
    weapon,
    extra: backpack,
  };
}
