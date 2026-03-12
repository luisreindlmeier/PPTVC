/* global DOMException */

import { OpfsStorageAdapter } from "./opfs-storage";

const USER_SETTINGS_PATH = "settings/user-settings.json";

export interface UserSettings {
  authorName?: string;
  email?: string;
  maxVersions?: number;
  autoSaveOnDocumentSave?: boolean;
  namingTemplate?: string;
  customTags?: string[];
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
