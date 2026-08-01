export type CharacterId = "jorio" | "birinezu" | "hayasugi" | "danboru";

export interface CharacterStats {
  /** Higher weight = less knockback taken, slightly slower acceleration. */
  weight: number;
  moveSpeed: number;
  jumpPower: number;
  /** Multiplier applied to all outgoing attack damage. */
  attackPower: number;
  /** Multiplier applied to outgoing knockback. */
  knockbackPower: number;
  /** Multiplier reducing incoming damage (1 = normal). */
  defense: number;
  /** Multiplier for special-ability magnitude (damage/effect strength). */
  specialPower: number;
  radius: number;
  height: number;
}

export interface CharacterPalette {
  primary: number;
  secondary: number;
  accent: number;
  skin: number;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  description: string;
  stats: CharacterStats;
  palette: CharacterPalette;
  specialName: string;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  jorio: {
    id: "jorio",
    name: "ジョリオ",
    title: "下水道の王",
    description: "赤い作業着の万能型ファイター。扱いやすく近中距離どちらもこなす。",
    stats: {
      weight: 1.0,
      moveSpeed: 6.2,
      jumpPower: 1.0,
      attackPower: 1.0,
      knockbackPower: 1.0,
      defense: 1.0,
      specialPower: 1.0,
      radius: 0.55,
      height: 1.75,
    },
    palette: { primary: 0xd6362f, secondary: 0x2b4fa8, accent: 0xffce4a, skin: 0xf1b48a },
    specialName: "マンホールギザー",
  },
  birinezu: {
    id: "birinezu",
    name: "ビリネズ",
    title: "コンセントの電気生物",
    description: "黄色い小型生物の高速型。軽くて速いがふっとびやすい。",
    stats: {
      weight: 0.72,
      moveSpeed: 8.4,
      jumpPower: 1.15,
      attackPower: 0.82,
      knockbackPower: 0.85,
      defense: 0.9,
      specialPower: 1.1,
      radius: 0.42,
      height: 1.15,
    },
    palette: { primary: 0xf4d21c, secondary: 0x1a1a1a, accent: 0x35e6ff, skin: 0xf4d21c },
    specialName: "ジグザグスパーク",
  },
  hayasugi: {
    id: "hayasugi",
    name: "ハヤスギ",
    title: "制御不能な高速戦士",
    description: "青いスーツの突進型。最高速は随一だが曲がりにくい上級者向け。",
    stats: {
      weight: 0.9,
      moveSpeed: 9.6,
      jumpPower: 1.05,
      attackPower: 1.05,
      knockbackPower: 1.05,
      defense: 0.92,
      specialPower: 1.2,
      radius: 0.48,
      height: 1.8,
    },
    palette: { primary: 0x2a6fe0, secondary: 0xe8f4ff, accent: 0x122845, skin: 0xe9c19a },
    specialName: "ハイパーダッシュモード",
  },
  danboru: {
    id: "danboru",
    name: "ダンボール・ジョー",
    title: "潜入兵士",
    description: "段ボール装甲の重量型。罠と遠距離攻撃を得意とし接近戦は苦手。",
    stats: {
      weight: 1.28,
      moveSpeed: 4.9,
      jumpPower: 0.88,
      attackPower: 1.12,
      knockbackPower: 1.15,
      defense: 1.12,
      specialPower: 1.0,
      radius: 0.6,
      height: 1.7,
    },
    palette: { primary: 0xc79a5a, secondary: 0x8a6a3d, accent: 0x4a4a4a, skin: 0x3a3a3a },
    specialName: "地雷トラップ",
  },
};

export const CHARACTER_ORDER: CharacterId[] = ["jorio", "birinezu", "hayasugi", "danboru"];
