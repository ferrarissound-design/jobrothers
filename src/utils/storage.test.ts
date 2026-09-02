import { describe, expect, it } from "vitest";
import { normalizeStoredSetting } from "./storage";

describe("normalizeStoredSetting", () => {
  it("accepts every supported enum setting value", () => {
    expect(normalizeStoredSetting("joebra_quality", "low")).toBe("low");
    expect(normalizeStoredSetting("joebra_quality", "medium")).toBe("medium");
    expect(normalizeStoredSetting("joebra_quality", "high")).toBe("high");

    expect(normalizeStoredSetting("joebra_difficulty", "easy")).toBe("easy");
    expect(normalizeStoredSetting("joebra_difficulty", "normal")).toBe("normal");
    expect(normalizeStoredSetting("joebra_difficulty", "hard")).toBe("hard");

    expect(normalizeStoredSetting("joebra_items", "off")).toBe("off");
    expect(normalizeStoredSetting("joebra_items", "low")).toBe("low");
    expect(normalizeStoredSetting("joebra_items", "normal")).toBe("normal");
    expect(normalizeStoredSetting("joebra_items", "high")).toBe("high");
  });

  it("drops stale or corrupted enum values instead of passing them into lookup tables", () => {
    expect(normalizeStoredSetting("joebra_quality", "ultra")).toBeNull();
    expect(normalizeStoredSetting("joebra_difficulty", "nightmare")).toBeNull();
    expect(normalizeStoredSetting("joebra_items", "lots" )).toBeNull();
  });

  it("leaves free-form settings alone so character and volume validation stays with their owners", () => {
    expect(normalizeStoredSetting("joebra_character", "future-fighter")).toBe("future-fighter");
    expect(normalizeStoredSetting("joebra_volume", "0.65")).toBe("0.65");
    expect(normalizeStoredSetting("unknown_key", "anything")).toBe("anything");
    expect(normalizeStoredSetting("joebra_quality", null)).toBeNull();
  });
});
