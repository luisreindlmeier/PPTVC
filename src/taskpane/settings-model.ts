import type { UserSettings } from "../storage";
import { DEFAULT_TAGS } from "../ui";

export const DEFAULT_SETTINGS: UserSettings = {
  authorName: "",
  email: "",
  autoSyncOnVersionSave: false,
  namingTemplate: "Version {version_number}",
  customTags: [],
};

export function mergeSettings(stored: UserSettings): UserSettings {
  const storedTemplate = stored.namingTemplate?.trim();
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    namingTemplate: storedTemplate || DEFAULT_SETTINGS.namingTemplate,
    customTags: stored.customTags ?? DEFAULT_SETTINGS.customTags ?? [],
  };
}

export function getDefaultVersionName(nextIndex: number, userSettings: UserSettings): string {
  const template = userSettings.namingTemplate?.trim() || DEFAULT_SETTINGS.namingTemplate!;
  const now = new Date();
  const date = now.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const datetime = `${date} ${time}`;

  return template.replace(/\{(version_number|date|time|datetime)\}/g, (match, key) => {
    switch (key) {
      case "version_number":
        return String(nextIndex);
      case "date":
        return date;
      case "time":
        return time;
      case "datetime":
        return datetime;
      default:
        return match;
    }
  });
}

export function getAvailableTags(userSettings: UserSettings): string[] {
  const customTags = (userSettings.customTags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return customTags.length > 0 ? customTags : [...DEFAULT_TAGS];
}
