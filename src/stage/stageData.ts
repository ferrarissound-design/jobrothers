import type { DestructibleType } from "./DestructibleObject";

export type StageId = "junction" | "rooftop";

/** A solid box a fighter can stand on. `topY` is both its height and its walking surface. */
export interface StagePlatformDef {
  x: number;
  z: number;
  w: number;
  d: number;
  topY: number;
  color: number;
}

export interface StageDestructibleDef {
  type: DestructibleType;
  x: number;
  z: number;
}

/**
 * Which procedural floor texture the arena disc gets. Both are painted on a
 * canvas at load time — the project ships no image assets — so a new surface
 * means a new branch in `createGroundTexture`, not a new file.
 */
export type GroundKind = "grass" | "concrete";

export interface StageGroundDef {
  kind: GroundKind;
  /** Base fill the speckles are painted over. */
  base: string;
  /** The two speckle tones dusted across the base, light and dark. */
  speckleLight: string;
  speckleDark: string;
  /** Colour of the worn ring painted at 55% of the arena radius. */
  ringColor: number;
  /** When set, a flat trim band is drawn at the rim to read as a built edge. */
  rimColor?: number;
}

export interface StageLightingDef {
  /** Sky dome, fog colour and the tint the arena is bathed in. */
  sky: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambientIntensity: number;
  sunColor: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  rimColor: number;
  rimIntensity: number;
  rimPosition: [number, number, number];
  /** Tone-mapping exposure; a dusk stage needs less than a midday one. */
  exposure: number;
  /** Where fog starts, in world units. The far end comes from the quality preset. */
  fogNear: number;
}

/** Which set of non-interactive scenery rings the arena. */
export type StageDressing = "scrapyard" | "skyline";

export interface StageDef {
  id: StageId;
  name: string;
  title: string;
  description: string;
  /** Radius of the walkable disc. Everything outside it is a fall. */
  arenaRadius: number;
  ground: StageGroundDef;
  lighting: StageLightingDef;
  platforms: StagePlatformDef[];
  dressing: StageDressing;
  destructibles: StageDestructibleDef[];
  spawnPoints: [number, number, number][];
  /** Accent colours for the stage's card on the select screen. */
  palette: { primary: number; accent: number };
  /** One-line characteristics listed under the description. */
  traits: string[];
}

/**
 * Every stage in the game, as data.
 *
 * `Stage` reads these and builds the arena — geometry, colliders, lighting and
 * props all come from here, so adding a stage means adding an entry and an
 * id, with no changes to the stage builder unless it needs a floor or a set of
 * scenery that does not exist yet.
 */
export const STAGES: Record<StageId, StageDef> = {
  junction: {
    id: "junction",
    name: "ジョー・ジャンクション",
    title: "廃品置き場の合流点",
    description:
      "廃品置き場と工場が合流する広いアリーナ。端まで距離があるので復帰しやすく、" +
      "壊せるドラム缶が多いので爆発を巻き込んだ立ち回りが強い。",
    arenaRadius: 26,
    ground: {
      kind: "grass",
      base: "#4f9c3f",
      speckleLight: "150,220,110",
      speckleDark: "30,80,25",
      ringColor: 0x3d7a34,
    },
    lighting: {
      sky: 0x87ceeb,
      hemiSky: 0x8ecdf0,
      hemiGround: 0x3f6b2a,
      hemiIntensity: 1.3,
      ambientIntensity: 0.25,
      sunColor: 0xfff2d8,
      sunIntensity: 3.1,
      sunPosition: [15, 24, 10],
      rimColor: 0xbfe0ff,
      rimIntensity: 1.0,
      rimPosition: [-12, 14, -18],
      exposure: 1.1,
      fogNear: 40,
    },
    platforms: [
      { x: 8, z: 6, w: 3.6, d: 3.6, topY: 1.5, color: 0x3d6ea5 },
      { x: -8, z: 6, w: 3.6, d: 3.6, topY: 1.5, color: 0x3d6ea5 },
      { x: 0, z: -10, w: 5, d: 3, topY: 1.1, color: 0x8a6a3d },
      { x: 11, z: -6, w: 2.6, d: 2.6, topY: 2.2, color: 0x5a5a52 },
    ],
    dressing: "scrapyard",
    destructibles: [
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
    ],
    spawnPoints: [
      [0, 0.5, 5],
      [5, 0.5, -3],
      [-5, 0.5, -3],
      [0, 0.5, -7],
    ],
    palette: { primary: 0x6ab04c, accent: 0xffd54f },
    traits: ["広いアリーナで復帰しやすい", "足場はひかえめ", "爆発するドラム缶が多い"],
  },

  rooftop: {
    id: "rooftop",
    name: "サンセット・ルーフ",
    title: "夕暮れのビル屋上",
    description:
      "高層ビルの屋上に作られた狭いアリーナ。空調ユニットや貯水槽が段差を作るので" +
      "立体的に戦えるが、端がすぐそこにあるので一発のふっとばしが致命傷になる。",
    arenaRadius: 19,
    ground: {
      kind: "concrete",
      // Cooled a little past neutral grey: the setting sun washes the whole
      // roof warm, and a true grey ends up reading as clay rather than concrete.
      base: "#666a71",
      speckleLight: "188,192,198",
      speckleDark: "52,54,60",
      ringColor: 0xe8c34a,
      rimColor: 0xb8b2ab,
    },
    lighting: {
      sky: 0xff9a5c,
      hemiSky: 0xffb26b,
      hemiGround: 0x3a2c3f,
      hemiIntensity: 1.15,
      ambientIntensity: 0.22,
      sunColor: 0xffb066,
      sunIntensity: 2.7,
      // Low and to the side: a setting sun rakes across the roof and throws
      // long shadows, which is most of what sells the time of day.
      sunPosition: [-22, 9, 14],
      rimColor: 0x8f7bd6,
      rimIntensity: 1.5,
      rimPosition: [16, 12, -16],
      exposure: 1.0,
      fogNear: 26,
    },
    platforms: [
      // Two air-conditioning blocks flanking the middle, at the height a
      // short hop clears — they break up the centre without walling it off.
      { x: 6.5, z: 3.5, w: 3.2, d: 2.4, topY: 1.3, color: 0x9aa3ab },
      { x: -6.5, z: 3.5, w: 3.2, d: 2.4, topY: 1.3, color: 0x9aa3ab },
      // The water tank stand: the high ground, and the most exposed spot.
      { x: 0, z: -6.5, w: 4.4, d: 4.4, topY: 2.6, color: 0x7a5c46 },
      // Low stair blocks leading up to it, so the tank is reachable on foot.
      { x: 0, z: -2.6, w: 3.4, d: 1.6, topY: 1.2, color: 0x8c8f94 },
      { x: -9.5, z: -4, w: 2.4, d: 2.4, topY: 1.8, color: 0x9aa3ab },
      { x: 9.5, z: -4, w: 2.4, d: 2.4, topY: 1.8, color: 0x9aa3ab },
    ],
    dressing: "skyline",
    destructibles: [
      { type: "crate", x: 2.6, z: 6.4 },
      { type: "crate", x: 3.6, z: 7.2 },
      { type: "vending", x: -3.4, z: 6.6 },
      { type: "drum", x: 8.4, z: 8 },
      { type: "drum", x: -8.4, z: 8 },
      { type: "drum", x: 0, z: 10.5 },
      { type: "sign", x: -12, z: 1.5 },
      { type: "sign", x: 12, z: 1.5 },
      { type: "wall", x: 5.5, z: -9.5 },
      { type: "wall", x: -5.5, z: -9.5 },
    ],
    spawnPoints: [
      [0, 0.5, 6],
      [6, 0.5, -1],
      [-6, 0.5, -1],
      [0, 3.1, -6.5],
    ],
    palette: { primary: 0xff8a3d, accent: 0x9f7bff },
    traits: ["狭くて端が近い", "段差が多く立体的", "水槽の上が最高の高台"],
  },
};

export const STAGE_ORDER: StageId[] = ["junction", "rooftop"];

export const DEFAULT_STAGE_ID: StageId = "junction";
