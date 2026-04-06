import type { UserSettings } from "../storage";
import { DEFAULT_TAGS } from "../ui";

function toTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function toPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : [];
}

function normalizeGitHubSync(value: unknown): UserSettings["githubSync"] {
  if (typeof value !== "object" || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const repo = toTrimmedString(record.repo);
  const branch = toTrimmedString(record.branch) || "main";
  const installationId = toPositiveInteger(record.installationId);
  const token = toTrimmedString(record.token);

  if (!repo) return undefined;

  return {
    repo,
    branch,
    ...(installationId !== undefined ? { installationId } : {}),
    ...(token ? { token } : {}),
  };
}

function normalizeGitHubSyncByDocument(value: unknown): UserSettings["githubSyncByDocument"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => {
      const sync = normalizeGitHubSync(item);
      return sync ? [key, sync] : null;
    })
    .filter((entry): entry is [string, NonNullable<UserSettings["githubSync"]>] => entry !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeUserSettings(stored: UserSettings): UserSettings {
  return {
    authorName: toTrimmedString(stored.authorName),
    email: toTrimmedString(stored.email),
    maxVersions: toPositiveInteger(stored.maxVersions),
    autoSaveOnDocumentSave: toBoolean(stored.autoSaveOnDocumentSave),
    autoSyncOnVersionSave: toBoolean(stored.autoSyncOnVersionSave),
    namingTemplate: toTrimmedString(stored.namingTemplate),
    customTags: normalizeTags(stored.customTags),
    githubSync: normalizeGitHubSync(stored.githubSync),
    githubSyncByDocument: normalizeGitHubSyncByDocument(stored.githubSyncByDocument),
    githubAccountConnected: toBoolean(stored.githubAccountConnected),
    githubAccountName: toTrimmedString(stored.githubAccountName),
    githubAccountAutoCheckDisabled: toBoolean(stored.githubAccountAutoCheckDisabled),
  };
}

export const DEFAULT_SETTINGS: UserSettings = {
  authorName: "",
  email: "",
  autoSyncOnVersionSave: false,
  namingTemplate: "Version {version_number}",
  customTags: [],
};

export function mergeSettings(stored: UserSettings): UserSettings {
  const normalized = normalizeUserSettings(stored);
  const storedTemplate = normalized.namingTemplate?.trim();
  return {
    ...DEFAULT_SETTINGS,
    ...normalized,
    namingTemplate: storedTemplate || DEFAULT_SETTINGS.namingTemplate,
    customTags: normalized.customTags ?? DEFAULT_SETTINGS.customTags ?? [],
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
