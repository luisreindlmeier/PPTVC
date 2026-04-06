import { OpfsStorageAdapter } from "./opfs-storage";

/** Factory that returns the runtime {@link OpfsStorageAdapter}. Used throughout the app and replaced by a mock in tests via `vi.mock("../storage")`. */
export function createStorageAdapter(): OpfsStorageAdapter {
  return new OpfsStorageAdapter();
}
