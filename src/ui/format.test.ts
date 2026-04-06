import { describe, expect, it } from "vitest";
import { formatBytes, formatTimestamp } from "./format";

describe("formatTimestamp", () => {
  it("returns a non-empty localized timestamp", () => {
    const formatted = formatTimestamp(Date.UTC(2026, 3, 6, 10, 30, 0));
    expect(formatted.length).toBeGreaterThan(0);
  });
});

describe("formatBytes", () => {
  it("formats byte values below 1KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes and gigabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});
