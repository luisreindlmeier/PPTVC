import { OpfsStorageAdapter } from "./opfs-storage";

export function createStorageAdapter(): OpfsStorageAdapter {
  return new OpfsStorageAdapter();
}
