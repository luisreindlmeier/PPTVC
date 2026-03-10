/* global Blob, DOMException, FileSystemDirectoryHandle, navigator */

import { StorageAdapter } from "./types";

const PATH_SEPARATOR = "/";

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function splitPath(path: string): string[] {
  return path
    .split(PATH_SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function getParentPath(path: string): { parentSegments: string[]; fileName: string } {
  const segments = splitPath(path);
  if (segments.length === 0) {
    throw new Error("Path cannot be empty.");
  }

  const fileName = segments[segments.length - 1];
  return {
    parentSegments: segments.slice(0, -1),
    fileName,
  };
}

export class OpfsStorageAdapter implements StorageAdapter {
  private rootHandlePromise: Promise<FileSystemDirectoryHandle> | null = null;

  private async getRootHandle(): Promise<FileSystemDirectoryHandle> {
    if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
      throw new Error("OPFS is not supported in this environment.");
    }

    if (!this.rootHandlePromise) {
      this.rootHandlePromise = navigator.storage.getDirectory();
    }

    return this.rootHandlePromise;
  }

  private async getDirectoryHandle(
    path: string,
    create: boolean
  ): Promise<FileSystemDirectoryHandle> {
    const segments = splitPath(path);
    let currentHandle = await this.getRootHandle();

    for (const segment of segments) {
      currentHandle = await currentHandle.getDirectoryHandle(segment, { create });
    }

    return currentHandle;
  }

  private async getParentDirectoryHandle(path: string): Promise<{
    parentHandle: FileSystemDirectoryHandle;
    fileName: string;
  }> {
    const { parentSegments, fileName } = getParentPath(path);
    let parentHandle = await this.getRootHandle();

    for (const segment of parentSegments) {
      parentHandle = await parentHandle.getDirectoryHandle(segment, { create: true });
    }

    return { parentHandle, fileName };
  }

  async writeBlob(path: string, blob: Blob): Promise<void> {
    const { parentHandle, fileName } = await this.getParentDirectoryHandle(path);
    const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    try {
      await writable.write(await blob.arrayBuffer());
    } finally {
      await writable.close();
    }
  }

  async writeJson<T>(path: string, value: T): Promise<void> {
    const jsonBlob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });

    await this.writeBlob(path, jsonBlob);
  }

  async listDirectory(path: string): Promise<string[]> {
    let directoryHandle: FileSystemDirectoryHandle;

    try {
      directoryHandle = await this.getDirectoryHandle(path, false);
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return [];
      }
      throw error;
    }

    const entries: string[] = [];

    for await (const [name] of directoryHandle.entries()) {
      entries.push(name);
    }

    return entries.sort((left, right) => left.localeCompare(right));
  }
}
