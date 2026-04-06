/* global Blob */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "../storage/in-memory-storage";
import type { VersionSnapshotMetadata } from "./types";

// vi.mock is hoisted — the factory must reference the module-level `adapter` variable
let adapter: InMemoryStorageAdapter;

vi.mock("../storage", () => ({
  createStorageAdapter: () => adapter,
}));

vi.mock("./document-scope", () => ({
  getVersionRootPath: () => Promise.resolve("versions/test-doc"),
}));

// Import after mocks are in place
const { listVersions } = await import("./list-versions");

const ROOT = "versions/test-doc";

function makeMetadata(
  id: string,
  overrides: Partial<VersionSnapshotMetadata> = {}
): VersionSnapshotMetadata {
  return {
    id,
    name: `Version ${id}`,
    timestamp: 1000,
    filename: "deck.pptx",
    xmlFiles: [],
    ...overrides,
  };
}

async function seedVersion(
  store: InMemoryStorageAdapter,
  id: string,
  metadata?: VersionSnapshotMetadata
): Promise<void> {
  if (metadata) {
    await store.writeJson(`${ROOT}/${id}/metadata.json`, metadata);
  }
  await store.writeBlob(
    `${ROOT}/${id}/snapshot.pptx`,
    new Blob(["pptx"], { type: "application/octet-stream" })
  );
}

beforeEach(() => {
  adapter = new InMemoryStorageAdapter();
});

describe("listVersions", () => {
  it("returns [] when the root directory is empty", async () => {
    const result = await listVersions();
    expect(result).toEqual([]);
  });

  it("returns a single version with correct paths", async () => {
    const meta = makeMetadata("abc123");
    await seedVersion(adapter, "abc123", meta);

    const result = await listVersions();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc123");
    expect(result[0].snapshotPath).toBe(`${ROOT}/abc123/snapshot.pptx`);
    expect(result[0].metadataPath).toBe(`${ROOT}/abc123/metadata.json`);
  });

  it("returns multiple versions sorted newest-first", async () => {
    await seedVersion(adapter, "v1", makeMetadata("v1", { timestamp: 1000 }));
    await seedVersion(adapter, "v2", makeMetadata("v2", { timestamp: 3000 }));
    await seedVersion(adapter, "v3", makeMetadata("v3", { timestamp: 2000 }));

    const result = await listVersions();

    expect(result.map((v) => v.timestamp)).toEqual([3000, 2000, 1000]);
  });

  it("skips versions with missing metadata.json", async () => {
    await seedVersion(adapter, "good", makeMetadata("good", { timestamp: 5000 }));
    // Seed a directory entry without metadata
    await adapter.writeBlob(`${ROOT}/bad/snapshot.pptx`, new Blob(["pptx"]));

    const result = await listVersions();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("good");
  });

  it("skips versions with corrupted metadata JSON", async () => {
    await adapter.writeBlob(`${ROOT}/corrupt/metadata.json`, new Blob(["not json"]));
    await adapter.writeBlob(`${ROOT}/corrupt/snapshot.pptx`, new Blob(["pptx"]));

    const result = await listVersions();

    expect(result).toEqual([]);
  });

  it("propagates all optional metadata fields", async () => {
    const meta = makeMetadata("rich", {
      displayName: "Q1 Review",
      authorName: "Alice",
      authorEmail: "alice@example.com",
      tags: ["reviewed", "final"],
      timestamp: 9999,
    });
    await seedVersion(adapter, "rich", meta);

    const result = await listVersions();

    expect(result).toHaveLength(1);
    const v = result[0];
    expect(v.displayName).toBe("Q1 Review");
    expect(v.authorName).toBe("Alice");
    expect(v.authorEmail).toBe("alice@example.com");
    expect(v.tags).toEqual(["reviewed", "final"]);
    expect(v.timestamp).toBe(9999);
  });
});
