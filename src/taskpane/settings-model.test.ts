import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  getAvailableTags,
  getDefaultVersionName,
  mergeSettings,
} from "./settings-model";

describe("mergeSettings", () => {
  it("falls back to default naming template for empty input", () => {
    const merged = mergeSettings({ namingTemplate: "   " });
    expect(merged.namingTemplate).toBe(DEFAULT_SETTINGS.namingTemplate);
  });

  it("keeps provided settings and initializes missing tag list", () => {
    const merged = mergeSettings({ authorName: "Alice" });
    expect(merged.authorName).toBe("Alice");
    expect(merged.customTags).toEqual([]);
  });
});

describe("getDefaultVersionName", () => {
  it("replaces version number token", () => {
    const name = getDefaultVersionName(7, { namingTemplate: "Version {version_number}" });
    expect(name).toBe("Version 7");
  });

  it("replaces datetime tokens", () => {
    const name = getDefaultVersionName(3, { namingTemplate: "{date} {time} {datetime}" });
    expect(name).not.toContain("{date}");
    expect(name).not.toContain("{time}");
    expect(name).not.toContain("{datetime}");
  });
});

describe("getAvailableTags", () => {
  it("returns custom tags when provided", () => {
    expect(getAvailableTags({ customTags: ["review", "final"] })).toEqual(["review", "final"]);
  });

  it("falls back to defaults when custom tags are empty", () => {
    const tags = getAvailableTags({ customTags: ["   "] });
    expect(tags.length).toBeGreaterThan(0);
  });
});
