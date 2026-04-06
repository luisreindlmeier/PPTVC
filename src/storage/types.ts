/* global Blob */

/**
 * Single storage abstraction that decouples all version and settings logic from OPFS.
 * Paths are slash-separated strings with no leading slash (e.g. `versions/doc-abc/1234/snapshot.pptx`).
 * Read operations throw a `DOMException` with `name === "NotFoundError"` when the path does not exist.
 * `writeJson` serialises with `JSON.stringify`.
 */
export interface StorageAdapter {
  /** Writes a raw Blob to the given path, creating intermediate directories as needed. */
  writeBlob(path: string, blob: Blob): Promise<void>;
  /** Serialises `value` as JSON and writes it to the given path. */
  writeJson<T>(path: string, value: T): Promise<void>;
  /** Reads and returns the Blob at the given path. Throws `NotFoundError` if absent. */
  readBlob(path: string): Promise<Blob>;
  /** Reads and parses JSON from the given path. Throws `NotFoundError` if absent. */
  readJson<T>(path: string): Promise<T>;
  /** Returns the names of direct children of the given directory path, sorted alphabetically. */
  listDirectory(path: string): Promise<string[]>;
  /** Recursively deletes a directory and all its contents. */
  deleteDirectory(path: string): Promise<void>;
}
