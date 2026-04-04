/* global Blob */

import JSZip from "jszip";
import { createStorageAdapter } from "../storage";
import { getVersionRootPath } from "./document-scope";

const SNAPSHOT_FILE_NAME = "snapshot.pptx";
const METADATA_FILE_NAME = "metadata.json";

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
      // Skip any entries that are missing
    }
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/zip",
  });
}
