import { OpfsStorageAdapter } from "./opfs-storage";

export { OpfsStorageAdapter };
export type { StorageAdapter } from "./types";

export function createStorageAdapter(): OpfsStorageAdapter {
  return new OpfsStorageAdapter();
}
