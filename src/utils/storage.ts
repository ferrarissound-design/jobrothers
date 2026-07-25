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

export function readSetting(key: string): string | null {
  if (memoryOnly) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    memoryOnly = true;
    return memory.get(key) ?? null;
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
