import { createStorageAdapter } from "../storage";

const VERSION_ROOT_PATH = "versions";

export async function deleteVersion(id: string): Promise<void> {
  const storage = createStorageAdapter();
  const existingVersionIds = await storage.listDirectory(VERSION_ROOT_PATH);

  if (!existingVersionIds.includes(id)) {
    throw new Error(`Version "${id}" does not exist.`);
  }

  await storage.deleteDirectory(`${VERSION_ROOT_PATH}/${id}`);
}
