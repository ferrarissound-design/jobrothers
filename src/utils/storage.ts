/**
 * localStorage access that can never break the game.
 *
 * Safari throws a SecurityError on any localStorage access when cookies are
 * blocked or the page is in Private Browsing, and both settings persistence
 * points run during construction — so an unguarded read takes the whole game
 * down before the first frame. Settings are a convenience, never a
 * prerequisite: fall back to in-memory values and carry on.
 */

let memoryOnly = false;
const memory = new Map<string, string>();

/**
 * Enum-like settings are consumed as lookup-table keys during startup. A stale
 * value from an older build or a hand-edited localStorage entry must therefore
 * be treated as "not set" rather than trusted: an unknown quality value would
 * otherwise turn QUALITY_PRESETS[value] into undefined and crash before the
 * first frame, while bad AI/item values can quietly turn timers into NaN.
 *
 * Keep this table keyed by the persisted string names instead of importing the
 * game config here. storage.ts is used by AudioManager and Game during module
 * construction, so avoiding a config dependency keeps this utility leaf-like
 * and free of circular imports.
 */
const ENUM_SETTING_VALUES: Readonly<Record<string, readonly string[]>> = {
  joebra_quality: ["low", "medium", "high"],
  joebra_difficulty: ["easy", "normal", "hard"],
  joebra_items: ["off", "low", "normal", "high"],
};

export function normalizeStoredSetting(key: string, value: string | null): string | null {
  if (value === null) return null;
  const allowed = ENUM_SETTING_VALUES[key];
  if (allowed && !allowed.includes(value)) return null;
  return value;
}

export function readSetting(key: string): string | null {
  if (memoryOnly) return normalizeStoredSetting(key, memory.get(key) ?? null);
  try {
    return normalizeStoredSetting(key, localStorage.getItem(key));
  } catch {
    memoryOnly = true;
    return normalizeStoredSetting(key, memory.get(key) ?? null);
  }
}

export function writeSetting(key: string, value: string): void {
  memory.set(key, value);
  if (memoryOnly) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    memoryOnly = true;
  }
}
