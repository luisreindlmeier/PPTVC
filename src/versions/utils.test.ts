import { describe, expect, it } from "vitest";
import { concatByteChunks, getFileNameFromUrl, normalizeSliceData } from "./utils";

describe("getFileNameFromUrl", () => {
  it("extracts filename from a file:// URL", () => {
    expect(getFileNameFromUrl("file:///Users/foo/Documents/Quarterly%20Report.pptx")).toBe(
      "Quarterly Report.pptx"
    );
  });

  it("extracts filename from a plain path", () => {
    expect(getFileNameFromUrl("/Users/foo/my-deck.pptx")).toBe("my-deck.pptx");
  });

  it("strips query string before extracting", () => {
    expect(getFileNameFromUrl("https://example.com/slides/deck.pptx?v=2")).toBe("deck.pptx");
  });

  it("returns Untitled.pptx for an empty string", () => {
    expect(getFileNameFromUrl("")).toBe("Untitled.pptx");
  });

  it("returns Untitled.pptx for a bare query string", () => {
    expect(getFileNameFromUrl("?foo=bar")).toBe("Untitled.pptx");
  });

  it("handles Windows-style backslash separators", () => {
    expect(getFileNameFromUrl("C:\\Users\\foo\\deck.pptx")).toBe("deck.pptx");
  });
});

describe("normalizeSliceData", () => {
  it("wraps an ArrayBuffer", () => {
    const buf = new ArrayBuffer(4);
    const result = normalizeSliceData(buf);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(4);
  });

  it("wraps an ArrayBufferView (Uint8Array)", () => {
    const view = new Uint8Array([1, 2, 3]);
    const result = normalizeSliceData(view);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3]);
  });

  it("converts a plain number array", () => {
    const result = normalizeSliceData([10, 20, 30]);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([10, 20, 30]);
  });

  it("throws for an unexpected type", () => {
    expect(() => normalizeSliceData("not a buffer")).toThrow(
      "Unexpected Office slice payload type."
    );
  });

  it("handles a sub-array view (byteOffset > 0)", () => {
    const buf = new ArrayBuffer(6);
    const view = new Uint8Array(buf, 2, 3);
    view[0] = 7;
    view[1] = 8;
    view[2] = 9;
    const result = normalizeSliceData(view);
    expect(Array.from(result)).toEqual([7, 8, 9]);
  });
});

describe("concatByteChunks", () => {
  it("concatenates two chunks", () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const result = concatByteChunks([a, b]);
    expect(Array.from(result)).toEqual([1, 2, 3, 4]);
  });

  it("returns empty array for no chunks", () => {
    expect(concatByteChunks([])).toEqual(new Uint8Array(0));
  });

  it("handles a single chunk", () => {
    const chunk = new Uint8Array([5, 6, 7]);
    expect(Array.from(concatByteChunks([chunk]))).toEqual([5, 6, 7]);
  });

  it("preserves correct byte order across many chunks", () => {
    const chunks = [new Uint8Array([0]), new Uint8Array([1]), new Uint8Array([2, 3])];
    expect(Array.from(concatByteChunks(chunks))).toEqual([0, 1, 2, 3]);
  });
});
