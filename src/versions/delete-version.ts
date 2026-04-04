import { createStorageAdapter } from "../storage";
import { getVersionRootPath } from "./document-scope";

export async function deleteVersion(id: string): Promise<void> {
  const storage = createStorageAdapter();
  const versionRootPath = await getVersionRootPath();
  const existingVersionIds = await storage.listDirectory(versionRootPath);

  if (!existingVersionIds.includes(id)) {
    throw new Error(`Version "${id}" does not exist.`);
  }

  await storage.deleteDirectory(`${versionRootPath}/${id}`);
}
