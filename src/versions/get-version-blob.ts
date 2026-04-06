/* global Blob */

import { createStorageAdapter } from "../storage";

/** Reads and returns the raw PPTX `Blob` from the given OPFS snapshot path. */
export async function getVersionBlob(snapshotPath: string): Promise<Blob> {
  const storage = createStorageAdapter();
  return storage.readBlob(snapshotPath);
}
