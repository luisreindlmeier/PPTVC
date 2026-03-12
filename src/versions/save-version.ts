/* global Blob, Office */

import JSZip from "jszip";
import { createStorageAdapter, type StorageAdapter } from "../storage";
import type { Version, VersionSnapshotMetadata, SaveVersionOptions } from "./types";

const VERSION_ROOT_PATH = "versions";
const SNAPSHOT_FILE_NAME = "snapshot.pptx";
const METADATA_FILE_NAME = "metadata.json";
const DEFAULT_FILE_NAME = "Untitled.pptx";
const SLICE_SIZE = 64 * 1024;

interface PptxFileData {
  blob: Blob;
  filename: string;
}

function getDocumentUrl(): string {
  const documentUrl = Office.context.document.url;
  if (typeof documentUrl !== "string") {
    return "";
  }

  return documentUrl;
}

function getFileNameFromUrl(url: string): string {
  const normalizedUrl = url.split("?")[0].trim();
  const segments = normalizedUrl.split(/[\\/]/).filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return DEFAULT_FILE_NAME;
  }

  return decodeURIComponent(segments[segments.length - 1]);
}

function normalizeSliceData(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }

  if (Array.isArray(data)) {
    return Uint8Array.from(data);
  }

  throw new Error("Unexpected Office slice payload type.");
}

function concatByteChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function getFileAsync(sliceSize: number): Promise<Office.File> {
  return new Promise<Office.File>((resolve, reject) => {
    Office.context.document.getFileAsync(
      Office.FileType.Compressed,
      { sliceSize },
      (result: Office.AsyncResult<Office.File>) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          reject(new Error(result.error.message));
          return;
        }

        resolve(result.value);
      }
    );
  });
}

function getSliceAsync(file: Office.File, index: number): Promise<Office.Slice> {
  return new Promise<Office.Slice>((resolve, reject) => {
    file.getSliceAsync(index, (result: Office.AsyncResult<Office.Slice>) => {
      if (result.status === Office.AsyncResultStatus.Failed) {
        reject(new Error(result.error.message));
        return;
      }

      resolve(result.value);
    });
  });
}

function closeFileAsync(file: Office.File): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    file.closeAsync((result: Office.AsyncResult<void>) => {
      if (result.status === Office.AsyncResultStatus.Failed) {
        reject(new Error(result.error.message));
        return;
      }

      resolve();
    });
  });
}

async function readCurrentPresentationAsBlob(): Promise<PptxFileData> {
  const file = await getFileAsync(SLICE_SIZE);

  try {
    const chunks: Uint8Array[] = [];

    for (let index = 0; index < file.sliceCount; index += 1) {
      const slice = await getSliceAsync(file, index);
      chunks.push(normalizeSliceData(slice.data));
    }

    const content = concatByteChunks(chunks);
    const filename = getFileNameFromUrl(getDocumentUrl());

    return {
      blob: new Blob([content.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      filename,
    };
  } finally {
    await closeFileAsync(file);
  }
}

async function getXmlFileList(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(blob);

  return Object.keys(zip.files)
    .filter((filePath) => filePath.toLowerCase().endsWith(".xml"))
    .sort((left, right) => left.localeCompare(right));
}

function createVersionId(now: number): string {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${now}-${randomSuffix}`;
}

async function createVersionName(storage: StorageAdapter): Promise<string> {
  const existingEntries = await storage.listDirectory(VERSION_ROOT_PATH);
  const versionNumber = existingEntries.length + 1;
  return `Version ${versionNumber}`;
}

export async function saveVersion(options: SaveVersionOptions = {}): Promise<Version> {
  const storage = createStorageAdapter();
  const { blob, filename } = await readCurrentPresentationAsBlob();
  const xmlFiles = await getXmlFileList(blob);

  const timestamp = Date.now();
  const id = createVersionId(timestamp);
  const name = await createVersionName(storage);
  const displayName = options.name?.trim() || undefined;
  const authorName = options.authorName?.trim() || undefined;
  const authorEmail = options.authorEmail?.trim() || undefined;
  const tags = options.tags ?? [];

  const snapshotPath = `${VERSION_ROOT_PATH}/${id}/${SNAPSHOT_FILE_NAME}`;
  const metadataPath = `${VERSION_ROOT_PATH}/${id}/${METADATA_FILE_NAME}`;

  const metadata: VersionSnapshotMetadata = {
    id,
    name,
    displayName,
    authorName,
    authorEmail,
    tags,
    timestamp,
    filename,
    xmlFiles,
  };

  await storage.writeBlob(snapshotPath, blob);
  await storage.writeJson(metadataPath, metadata);

  return {
    id,
    name,
    displayName,
    authorName,
    authorEmail,
    tags,
    timestamp,
    filename,
    snapshotPath,
    metadataPath,
  };
}
