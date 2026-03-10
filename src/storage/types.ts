/* global Blob */

export interface StorageAdapter {
  writeBlob(path: string, blob: Blob): Promise<void>;
  writeJson<T>(path: string, value: T): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
}
