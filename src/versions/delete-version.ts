import { createStorageAdapter } from "../storage";
import { getVersionRootPath, setLocalVersioningHint } from "./document-scope";

/**
 * Removes the entire version directory (snapshot + metadata) from OPFS.
 * Throws if the given `id` does not exist in the current document scope.
 */
export async function deleteVersion(id: string): Promise<void> {
  const storage = createStorageAdapter();
  const versionRootPath = await getVersionRootPath();
  const existingVersionIds = await storage.listDirectory(versionRootPath);

  if (!existingVersionIds.includes(id)) {
    throw new Error(`Version "${id}" does not exist.`);
  }

  await storage.deleteDirectory(`${versionRootPath}/${id}`);

  const remainingVersionIds = await storage.listDirectory(versionRootPath);
  await setLocalVersioningHint(remainingVersionIds.length > 0);
}
