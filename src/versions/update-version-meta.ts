import { createStorageAdapter } from "../storage";
import type { UpdateVersionMetaOptions, VersionSnapshotMetadata } from "./types";

const VERSION_ROOT_PATH = "versions";
const METADATA_FILE_NAME = "metadata.json";

export async function updateVersionMeta(
  id: string,
  options: UpdateVersionMetaOptions
): Promise<void> {
  const storage = createStorageAdapter();
  const metadataPath = `${VERSION_ROOT_PATH}/${id}/${METADATA_FILE_NAME}`;
  const metadata = await storage.readJson<VersionSnapshotMetadata>(metadataPath);

  if (options.displayName !== undefined) {
    metadata.displayName = options.displayName || undefined;
  }
  if (options.tags !== undefined) {
    metadata.tags = options.tags;
  }

  await storage.writeJson(metadataPath, metadata);
}
