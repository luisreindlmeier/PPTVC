/* global Blob */

import JSZip from "jszip";
import { createStorageAdapter } from "../storage";

const VERSION_ROOT_PATH = "versions";
const SNAPSHOT_FILE_NAME = "snapshot.pptx";
const METADATA_FILE_NAME = "metadata.json";

export async function exportVersionsZip(): Promise<Blob> {
  const storage = createStorageAdapter();
  const versionIds = await storage.listDirectory(VERSION_ROOT_PATH);
  const zip = new JSZip();

  for (const id of versionIds) {
    const snapshotPath = `${VERSION_ROOT_PATH}/${id}/${SNAPSHOT_FILE_NAME}`;
    const metadataPath = `${VERSION_ROOT_PATH}/${id}/${METADATA_FILE_NAME}`;

    try {
      const [snapshotBlob, metadataBlob] = await Promise.all([
        storage.readBlob(snapshotPath),
        storage.readBlob(metadataPath),
      ]);

      zip.file(`versions/${id}/${SNAPSHOT_FILE_NAME}`, snapshotBlob);
      zip.file(`versions/${id}/${METADATA_FILE_NAME}`, metadataBlob);
    } catch {
      // Skip any entries that are missing
    }
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
}
