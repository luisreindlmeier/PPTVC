/* global Blob, DOMException, TextDecoder */

import type { StorageAdapter } from "./types";

/**
 * In-memory implementation of {@link StorageAdapter} backed by a `Map<string, Blob>`.
 * Intended for use in unit tests only — not exported from `src/storage/index.ts`.
 * Import directly: `import { InMemoryStorageAdapter } from "../storage/in-memory-storage"`.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, Blob>();

  async writeBlob(path: string, blob: Blob): Promise<void> {
    this.store.set(path, blob);
  }

  async writeJson<T>(path: string, value: T): Promise<void> {
    const json = JSON.stringify(value);
    this.store.set(path, new Blob([json], { type: "application/json" }));
  }

  async readBlob(path: string): Promise<Blob> {
    const blob = this.store.get(path);
    if (!blob) {
      throw new DOMException(`Not found: ${path}`, "NotFoundError");
    }
    return blob;
  }

  async readJson<T>(path: string): Promise<T> {
    const blob = await this.readBlob(path);
    const text = new TextDecoder().decode(await blob.arrayBuffer());
    return JSON.parse(text) as T;
  }

  async listDirectory(path: string): Promise<string[]> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const children = new Set<string>();

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        const remainder = key.slice(prefix.length);
        const segment = remainder.split("/")[0];
        if (segment) {
          children.add(segment);
        }
      }
    }

    return Array.from(children).sort((a, b) => a.localeCompare(b));
  }

  async deleteDirectory(path: string): Promise<void> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    for (const key of Array.from(this.store.keys())) {
      if (key === path || key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}
