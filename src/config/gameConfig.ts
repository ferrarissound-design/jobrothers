export type QualityLevel = "low" | "medium" | "high";
export type AIDifficulty = "easy" | "normal" | "hard";
export type ItemFrequency = "off" | "low" | "normal" | "high";

export interface QualitySettings {
  pixelRatioMax: number;
  shadows: boolean;
  shadowMapSize: number;
  maxParticles: number;
  maxFragments: number;
  drawDistance: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    pixelRatioMax: 1,
    shadows: false,
    shadowMapSize: 512,
    maxParticles: 60,
    maxFragments: 30,
    drawDistance: 90,
  },
  medium: {
    pixelRatioMax: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    maxParticles: 140,
    maxFragments: 60,
    drawDistance: 140,
  },
  high: {
    pixelRatioMax: 2,
    shadows: true,
    shadowMapSize: 2048,
    maxParticles: 260,
    maxFragments: 100,
    drawDistance: 220,
  },
};

export const GameConfig = {
  gravity: -28,
  fallDeathY: -14,
  arenaRadius: 26,
  skyColor: 0x87ceeb,
  initialStocks: 3,
  matchTimeLimit: 180, // seconds, 0 = no limit (kept generous for MVP)
  respawnInvulnDuration: 2.2,
  fixedTimeStep: 1 / 60,
  maxSubSteps: 5,

  // knockback / damage tuning
  knockback: {
    baseScale: 1.0, // overall multiplier applied to the final launch speed
    launchClamp: 46,
    hitstunPerPower: 0.11,
    hitstunClamp: 1.6,
  },

  guard: {
    maxDurability: 100,
    regenPerSecond: 14,
    regenDelay: 0.6,
    breakStunDuration: 2.0,
    chipDamageRatio: 0.05,
    knockbackReduction: 0.12,
  },

  dodge: {
    duration: 0.32,
    invulnDuration: 0.22,
    speed: 13,
    cooldown: 0.85,
    airCooldown: 0.85,
  },

  jump: {
    groundJumpVelocity: 11.5,
    airJumpVelocity: 10,
    maxAirJumps: 1,
  },

  dash: {
    speedMultiplier: 1.9,
    staminaMax: 100,
    staminaDrainPerSecond: 55,
    staminaRegenPerSecond: 30,
  },

  camera: {
    distance: 7.2,
    minDistance: 2.6,
    height: 3.0,
    lookHeight: 1.4,
    followLambda: 6,
    rotateLambda: 8,
    fov: 60,
    shakeDecay: 6,
    hitStopDuration: 0.06,
    // Touch drags cover far fewer pixels than a mouse sweep across a desk, so
    // the same raw delta needs a boost to turn the camera by a comparable amount.
    touchLookMultiplier: 2.2,
  },

  items: {
    /** Seconds between spawn attempts, per frequency setting. 0 disables items. */
    interval: { off: 0, low: 12, normal: 7, high: 3.6 } as Record<ItemFrequency, number>,
    /** Pickups allowed on the stage at once, so a quiet match cannot carpet it. */
    maxActive: 4,
    /** Height items drop from — high enough to be spotted on the way down. */
    spawnHeight: 13,
    /** How far above the floor a landed item floats. */
    restHeight: 0.35,
    lifetime: 24,
    /** Seconds of blinking before a pickup expires. */
    blinkTime: 3,
    /** Extra reach beyond the fighter's own radius for walking into a pickup. */
    pickupRadius: 0.75,
  },

  ai: {
    decisionInterval: { easy: 0.45, normal: 0.3, hard: 0.16 },
    reactionDelay: { easy: 0.35, normal: 0.18, hard: 0.06 },
    mistakeChance: { easy: 0.35, normal: 0.15, hard: 0.03 },
  },

  cpuCount: 3,
};

export const STORAGE_KEYS = {
  quality: "joebra_quality",
  volume: "joebra_volume",
  musicVolume: "joebra_music_volume",
  difficulty: "joebra_difficulty",
  character: "joebra_character",
  items: "joebra_items",
};
