/* global Blob */

export interface StorageAdapter {
  writeBlob(path: string, blob: Blob): Promise<void>;
  writeJson<T>(path: string, value: T): Promise<void>;
  readBlob(path: string): Promise<Blob>;
  readJson<T>(path: string): Promise<T>;
  listDirectory(path: string): Promise<string[]>;
}
