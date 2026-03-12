import { createStorageAdapter } from "../storage";

const VERSION_ROOT_PATH = "versions";

export async function deleteAllVersions(): Promise<void> {
  const storage = createStorageAdapter();
  await storage.deleteDirectory(VERSION_ROOT_PATH);
}
