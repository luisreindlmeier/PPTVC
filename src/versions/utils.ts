const DEFAULT_FILE_NAME = "Untitled.pptx";

/** Extracts the file name from a document URL, stripping query strings and decoding percent-encoding. */
export function getFileNameFromUrl(url: string): string {
  const normalizedUrl = url.split("?")[0].trim();
  const segments = normalizedUrl.split(/[\\/]/).filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return DEFAULT_FILE_NAME;
  }

  return decodeURIComponent(segments[segments.length - 1]);
}

/** Normalises an Office slice payload to a Uint8Array regardless of the raw data type. */
export function normalizeSliceData(data: unknown): Uint8Array {
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

/** Concatenates multiple Uint8Array chunks into a single contiguous buffer. */
export function concatByteChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}
