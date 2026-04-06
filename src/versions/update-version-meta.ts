import { createStorageAdapter } from "../storage";
import { getVersionRootPath } from "./document-scope";
import type { UpdateVersionMetaOptions, VersionSnapshotMetadata } from "./types";

const METADATA_FILE_NAME = "metadata.json";

/**
 * Partially updates the `displayName` and/or `tags` of a stored version's metadata JSON
 * without touching the snapshot blob.
 */
export async function updateVersionMeta(
  id: string,
  options: UpdateVersionMetaOptions
): Promise<void> {
  const storage = createStorageAdapter();
  const versionRootPath = await getVersionRootPath();
  const metadataPath = `${versionRootPath}/${id}/${METADATA_FILE_NAME}`;
  const metadata = await storage.readJson<VersionSnapshotMetadata>(metadataPath);

  if (options.displayName !== undefined) {
    metadata.displayName = options.displayName || undefined;
  }
  if (options.tags !== undefined) {
    metadata.tags = options.tags;
  }

  await storage.writeJson(metadataPath, metadata);
}
