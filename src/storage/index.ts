import { OpfsStorageAdapter } from "./opfs-storage";

export { OpfsStorageAdapter };
export type { StorageAdapter } from "./types";
export {
  readUserSettings,
  writeUserSettings,
  type UserSettings,
  type NamingScheme,
  type NamingSchemeMode,
  type GitHubSyncConfig,
} from "./user-settings";

export function createStorageAdapter(): OpfsStorageAdapter {
  return new OpfsStorageAdapter();
}
