/* global Blob */

import { createStorageAdapter } from "../storage";

export async function getVersionBlob(snapshotPath: string): Promise<Blob> {
  const storage = createStorageAdapter();
  return storage.readBlob(snapshotPath);
}
