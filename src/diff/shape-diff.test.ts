import { describe, expect, it } from "vitest";
import { DIFF_OBJECT_PATTERNS, extractObjectId } from "./shape-diff";

describe("extractObjectId", () => {
  it("extracts id from cNvPr attribute", () => {
    const xml = `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Title"/></p:nvSpPr></p:sp>`;
    expect(extractObjectId(xml)).toBe("5");
  });

  it("returns null when no cNvPr id present", () => {
    const xml = `<p:sp><p:nvSpPr><p:cNvSpPr/></p:nvSpPr></p:sp>`;
    expect(extractObjectId(xml)).toBeNull();
  });

  it("extracts the first id when multiple cNvPr elements exist", () => {
    const xml = `<p:sp><p:cNvPr id="3" name="A"/><p:cNvPr id="9" name="B"/></p:sp>`;
    expect(extractObjectId(xml)).toBe("3");
  });

  it("handles id with extra attributes before it", () => {
    const xml = `<p:sp><p:cNvPr descr="desc" id="42" name="Foo"/></p:sp>`;
    expect(extractObjectId(xml)).toBe("42");
  });
});

describe("DIFF_OBJECT_PATTERNS", () => {
  it("contains patterns for all expected shape kinds", () => {
    const kinds = DIFF_OBJECT_PATTERNS.map((p) => p.kind);
    expect(kinds).toContain("sp");
    expect(kinds).toContain("pic");
    expect(kinds).toContain("graphicFrame");
    expect(kinds).toContain("cxnSp");
    expect(kinds).toContain("grpSp");
    expect(kinds).toContain("contentPart");
  });

  it("sp pattern matches a minimal shape element", () => {
    const pattern = DIFF_OBJECT_PATTERNS.find((p) => p.kind === "sp");
    expect(pattern).toBeDefined();
    const xml = `<p:sp><p:nvSpPr/></p:sp>`;
    pattern!.regex.lastIndex = 0;
    expect(pattern!.regex.test(xml)).toBe(true);
  });

  it("pic pattern matches a minimal picture element", () => {
    const pattern = DIFF_OBJECT_PATTERNS.find((p) => p.kind === "pic");
    expect(pattern).toBeDefined();
    const xml = `<p:pic><p:nvPicPr/></p:pic>`;
    pattern!.regex.lastIndex = 0;
    expect(pattern!.regex.test(xml)).toBe(true);
  });

  it("sp pattern does not match a pic element", () => {
    const pattern = DIFF_OBJECT_PATTERNS.find((p) => p.kind === "sp");
    expect(pattern).toBeDefined();
    const xml = `<p:pic><p:nvPicPr/></p:pic>`;
    pattern!.regex.lastIndex = 0;
    expect(pattern!.regex.test(xml)).toBe(false);
  });
});
