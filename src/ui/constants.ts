export const DEFAULT_TAGS = [
  "draft",
  "reviewed",
  "final",
  "sent",
  "archived",
  "important",
  "wip",
] as const;

export const MAX_TAGS = 3;

export type ScopeTab = "history" | "diff" | "workflow";

export const TAB_ORDER: Record<ScopeTab, number> = {
  history: 0,
  diff: 1,
  workflow: 2,
};

export type SettingsTab = "general" | "storage" | "versioning" | "tags";

export const SETTINGS_TAB_ORDER: Record<SettingsTab, number> = {
  general: 0,
  storage: 1,
  versioning: 2,
  tags: 3,
};
