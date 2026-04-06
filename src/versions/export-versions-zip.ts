/* global Blob */

import JSZip from "jszip";
import { createStorageAdapter } from "../storage";
import { getVersionRootPath } from "./document-scope";

const SNAPSHOT_FILE_NAME = "snapshot.pptx";
const METADATA_FILE_NAME = "metadata.json";

/**
 * Packs all version snapshots and their metadata into a single in-memory ZIP `Blob`.
 * Silently skips any entries whose blobs cannot be read (e.g. concurrent deletion).
 */
export async function exportVersionsZip(): Promise<Blob> {
  const storage = createStorageAdapter();
  const versionRootPath = await getVersionRootPath();
  const versionIds = await storage.listDirectory(versionRootPath);
  const zip = new JSZip();

  for (const id of versionIds) {
    const snapshotPath = `${versionRootPath}/${id}/${SNAPSHOT_FILE_NAME}`;
    const metadataPath = `${versionRootPath}/${id}/${METADATA_FILE_NAME}`;

    try {
      const [snapshotBlob, metadataBlob] = await Promise.all([
        storage.readBlob(snapshotPath),
        storage.readBlob(metadataPath),
      ]);

      zip.file(`versions/${id}/${SNAPSHOT_FILE_NAME}`, snapshotBlob);
      zip.file(`versions/${id}/${METADATA_FILE_NAME}`, metadataBlob);
    } catch {
      // Intentionally silent: skips entries whose snapshot or metadata blob
      // cannot be read (e.g. concurrent deletion). ZIP is still returned
      // with all successfully-read entries.
    }
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
}
