import { createStorageAdapter } from "../storage";
import { getVersionRootPath } from "./document-scope";
import type { Version, VersionSnapshotMetadata } from "./types";

const SNAPSHOT_FILE_NAME = "snapshot.pptx";
const METADATA_FILE_NAME = "metadata.json";

export async function listVersions(): Promise<Version[]> {
  const storage = createStorageAdapter();
  const versionRootPath = await getVersionRootPath();
  const versionIds = await storage.listDirectory(versionRootPath);
  const versions: Version[] = [];

  for (const id of versionIds) {
    const metadataPath = `${versionRootPath}/${id}/${METADATA_FILE_NAME}`;
    const snapshotPath = `${versionRootPath}/${id}/${SNAPSHOT_FILE_NAME}`;

    try {
      const metadata = await storage.readJson<VersionSnapshotMetadata>(metadataPath);
      versions.push({
        id: metadata.id,
        name: metadata.name,
        displayName: metadata.displayName,
        authorName: metadata.authorName,
        authorEmail: metadata.authorEmail,
        tags: metadata.tags,
        timestamp: metadata.timestamp,
        filename: metadata.filename,
        snapshotPath,
        metadataPath,
      });
    } catch {
      // Skip entries whose metadata is missing or corrupted
    }
  }

  return versions.sort((left, right) => right.timestamp - left.timestamp);
}
