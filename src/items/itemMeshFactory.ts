import * as THREE from "three";
import { ModelKit, bakeStatic, noShadow } from "../characters/meshKit";
import { addOutlines } from "../render/celShading";
import type { ItemDef, ItemId } from "./itemData";

/**
 * Item models, built from the same primitives and cel-shading kit as the
 * fighters so a dropped item never looks like it came from a different game.
 *
 * Every model is authored around a ~0.5 m silhouette with its origin at the
 * center, so the same mesh works lying on the ground, spinning in a pickup
 * bob, and parented to a fighter's hand without a per-item offset table.
 */

/** Widest ink line on an item. Finer than a fighter's — these are small props. */
const ITEM_INK = 0.009;

export function createItemMesh(def: ItemDef): THREE.Group {
  const kit = new ModelKit(ITEM_INK);
  const group = BUILDERS[def.id](kit);
  bakeStatic(group);
  addOutlines(group);
  return group;
}

const BUILDERS: Record<ItemId, (kit: ModelKit) => THREE.Group> = {
  wrench: buildWrench,
  bomb: buildBomb,
  blaster: buildBlaster,
  burger: buildBurger,
  star: buildStar,
};

// ---------------------------------------------------------------------------
// デカスパナ — oversized pipe wrench, held along its shaft.
// ---------------------------------------------------------------------------
function buildWrench(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();
  const steel = 0xb8c4d0;
  const dark = 0x6b7783;

  const shaft = kit.cylinder(0.045, 0.05, 0.62, steel, "metal", 10);
  g.add(shaft);

  const grip = kit.cylinder(0.058, 0.058, 0.2, 0x2f2721, "leather", 10);
  grip.position.y = -0.2;
  g.add(noShadow(grip));

  // Fixed jaw plus the sliding one, offset so the head reads as a wrench and
  // not a hammer from the silhouette alone.
  const head = kit.box(0.2, 0.1, 0.08, steel, "metal");
  head.position.y = 0.3;
  g.add(head);

  const fixedJaw = kit.box(0.07, 0.17, 0.08, steel, "metal");
  fixedJaw.position.set(-0.065, 0.4, 0);
  g.add(fixedJaw);

  const slidingJaw = kit.box(0.07, 0.13, 0.08, dark, "metal");
  slidingJaw.position.set(0.065, 0.38, 0);
  g.add(slidingJaw);

  const screw = kit.cylinder(0.038, 0.038, 0.09, dark, "metal", 8);
  screw.rotation.z = Math.PI / 2;
  screw.position.y = 0.22;
  g.add(noShadow(screw));

  return g;
}

// ---------------------------------------------------------------------------
// ドラム缶ボム — a shrunken fuel drum with a lit fuse.
// ---------------------------------------------------------------------------
function buildBomb(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();
  const red = 0xd6362f;

  const drum = kit.cylinder(0.21, 0.21, 0.44, red, "metal", 14);
  g.add(drum);

  for (const y of [-0.12, 0.12]) {
    const band = kit.cylinder(0.222, 0.222, 0.05, 0x1a1a1a, "metal", 14, true);
    band.position.y = y;
    g.add(noShadow(band));
  }

  const lid = kit.cylinder(0.18, 0.18, 0.04, 0x8a2018, "metal", 12);
  lid.position.y = 0.23;
  g.add(noShadow(lid));

  const fuse = kit.cylinder(0.018, 0.018, 0.14, 0x6b5a3c, "leather", 6);
  fuse.position.y = 0.31;
  fuse.rotation.z = 0.3;
  g.add(noShadow(fuse));

  const spark = kit.sphere(0.05, 0xffd54f, "glow", 8);
  spark.position.set(-0.04, 0.38, 0);
  g.add(noShadow(spark));

  return g;
}

// ---------------------------------------------------------------------------
// ジャンクブラスター — scrap-built energy pistol.
// ---------------------------------------------------------------------------
function buildBlaster(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();
  const shell = 0x4a5866;
  const cyan = 0x35e6ff;

  const body = kit.box(0.16, 0.16, 0.42, shell, "metal");
  g.add(body);

  const barrel = kit.cylinder(0.055, 0.07, 0.34, 0x2b333d, "metal", 10);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.34;
  g.add(barrel);

  const muzzle = kit.cylinder(0.09, 0.075, 0.06, cyan, "glow", 10);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.z = 0.51;
  g.add(noShadow(muzzle));

  const grip = kit.box(0.11, 0.24, 0.12, 0x2f2721, "leather");
  grip.position.set(0, -0.17, -0.1);
  grip.rotation.x = -0.22;
  g.add(grip);

  // Charge cell — reads as the "ammo left" part of the silhouette.
  const cell = kit.box(0.09, 0.1, 0.2, cyan, "glow");
  cell.position.set(0, 0.11, -0.08);
  g.add(noShadow(cell));

  return g;
}

// ---------------------------------------------------------------------------
// ジャンクバーガー — the healing item.
// ---------------------------------------------------------------------------
function buildBurger(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();

  const bunTop = kit.dome(0.24, 0xf0a03c, "cloth", 14);
  bunTop.scale.y = 0.78;
  bunTop.position.y = 0.06;
  g.add(bunTop);

  const lettuce = kit.cylinder(0.235, 0.235, 0.055, 0x6cc24a, "cloth", 14);
  lettuce.position.y = 0.02;
  g.add(noShadow(lettuce));

  const patty = kit.cylinder(0.215, 0.215, 0.09, 0x6b4226, "leather", 14);
  patty.position.y = -0.05;
  g.add(patty);

  const cheese = kit.box(0.36, 0.02, 0.36, 0xffc93c, "cloth");
  cheese.position.y = -0.005;
  cheese.rotation.y = 0.4;
  g.add(noShadow(cheese));

  const bunBottom = kit.cylinder(0.225, 0.2, 0.1, 0xe08c2c, "cloth", 14);
  bunBottom.position.y = -0.14;
  g.add(bunBottom);

  return g;
}

// ---------------------------------------------------------------------------
// ゴールドギア — the invincibility item.
// ---------------------------------------------------------------------------
function buildStar(kit: ModelKit): THREE.Group {
  const g = new THREE.Group();
  const gold = 0xffd54f;

  const disc = kit.cylinder(0.2, 0.2, 0.08, gold, "metal", 18);
  disc.rotation.x = Math.PI / 2;
  g.add(disc);

  // Gear teeth, laid around the rim rather than modelled into the geometry.
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = kit.box(0.09, 0.09, 0.08, gold, "metal");
    tooth.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0);
    tooth.rotation.z = a;
    g.add(tooth);
  }

  const hub = kit.cylinder(0.075, 0.075, 0.12, 0xfff3b0, "glow", 12);
  hub.rotation.x = Math.PI / 2;
  g.add(noShadow(hub));

  return g;
}
