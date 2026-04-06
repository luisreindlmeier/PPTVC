/* global DOMException */

import { createStorageAdapter } from "./create-storage-adapter";

const USER_SETTINGS_PATH = "settings/user-settings.json";

/**
 * GitHub sync configuration stored in user settings.
 * `token` is an optional PAT — omit when the Gedonus GitHub App is connected via `installationId`.
 */
export interface GitHubSyncConfig {
  token?: string; // Optional — not needed when Gedonus App is connected
  repo: string;
  branch: string;
  installationId?: number; // Gedonus GitHub App installation ID for this repo
}

/** Persisted user preferences. All fields are optional; missing fields fall back to defaults defined in `src/taskpane/settings-model.ts`. */
export interface UserSettings {
  authorName?: string;
  email?: string;
  maxVersions?: number;
  autoSaveOnDocumentSave?: boolean;
  namingTemplate?: string;
  customTags?: string[];
  githubSync?: GitHubSyncConfig;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

/** Reads user settings from `settings/user-settings.json` in OPFS. Returns `{}` if the file does not yet exist. */
export async function readUserSettings(): Promise<UserSettings> {
  const storage = createStorageAdapter();

  try {
    return await storage.readJson<UserSettings>(USER_SETTINGS_PATH);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return {};
    }
    throw error;
  }
}

/** Serialises and overwrites the user settings file at `settings/user-settings.json` in OPFS. */
export async function writeUserSettings(settings: UserSettings): Promise<void> {
  const storage = createStorageAdapter();
  await storage.writeJson(USER_SETTINGS_PATH, settings);
}
