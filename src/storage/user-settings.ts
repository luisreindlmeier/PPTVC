/* global DOMException */

import { OpfsStorageAdapter } from "./opfs-storage";

const USER_SETTINGS_PATH = "settings/user-settings.json";

export interface GitHubSyncConfig {
  token: string;
  repo: string;
  branch: string;
  gedonusToken?: string;
}

export interface UserSettings {
  authorName?: string;
  email?: string;
  maxVersions?: number;
  autoSaveOnDocumentSave?: boolean;
  namingScheme?: NamingScheme;
  customTags?: string[];
  githubSync?: GitHubSyncConfig;
}

export type NamingSchemeMode = "version" | "date" | "prefix";

export interface NamingScheme {
  mode: NamingSchemeMode;
  prefix?: string;
  dateFormat?: "iso" | "short" | "long";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export async function readUserSettings(): Promise<UserSettings> {
  const storage = new OpfsStorageAdapter();

  try {
    return await storage.readJson<UserSettings>(USER_SETTINGS_PATH);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return {};
    }
    throw error;
  }
}

export async function writeUserSettings(settings: UserSettings): Promise<void> {
  const storage = new OpfsStorageAdapter();
  await storage.writeJson(USER_SETTINGS_PATH, settings);
}
