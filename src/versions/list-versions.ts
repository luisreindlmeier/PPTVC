import { createStorageAdapter } from "../storage";
import type { Version, VersionSnapshotMetadata } from "./types";

const VERSION_ROOT_PATH = "versions";
const SNAPSHOT_FILE_NAME = "snapshot.pptx";
const METADATA_FILE_NAME = "metadata.json";

export async function listVersions(): Promise<Version[]> {
  const storage = createStorageAdapter();
  const versionIds = await storage.listDirectory(VERSION_ROOT_PATH);
  const versions: Version[] = [];

  for (const id of versionIds) {
    const metadataPath = `${VERSION_ROOT_PATH}/${id}/${METADATA_FILE_NAME}`;
    const snapshotPath = `${VERSION_ROOT_PATH}/${id}/${SNAPSHOT_FILE_NAME}`;

    try {
      const metadata = await storage.readJson<VersionSnapshotMetadata>(metadataPath);
      versions.push({
        id: metadata.id,
        name: metadata.name,
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
