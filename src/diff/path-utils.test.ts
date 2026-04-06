import { describe, expect, it } from "vitest";
import {
  basenameOf,
  dirOf,
  escapeRegex,
  relativePathTo,
  relsPathOf,
  resolveRelPath,
} from "./path-utils";

describe("dirOf", () => {
  it("returns directory with trailing slash", () => {
    expect(dirOf("ppt/slides/slide1.xml")).toBe("ppt/slides/");
  });

  it("returns empty string for bare filename", () => {
    expect(dirOf("slide1.xml")).toBe("");
  });

  it("handles root-level path", () => {
    expect(dirOf("/file.xml")).toBe("/");
  });
});

describe("basenameOf", () => {
  it("returns file name from nested path", () => {
    expect(basenameOf("ppt/slides/slide1.xml")).toBe("slide1.xml");
  });

  it("returns the value itself for a bare filename", () => {
    expect(basenameOf("slide1.xml")).toBe("slide1.xml");
  });

  it("returns last segment for deeply nested path", () => {
    expect(basenameOf("a/b/c/d.rels")).toBe("d.rels");
  });
});

describe("relsPathOf", () => {
  it("builds correct .rels path for a slide", () => {
    expect(relsPathOf("ppt/slides/slide1.xml")).toBe("ppt/slides/_rels/slide1.xml.rels");
  });

  it("builds correct .rels path for a top-level file", () => {
    expect(relsPathOf("ppt/presentation.xml")).toBe("ppt/_rels/presentation.xml.rels");
  });
});

describe("resolveRelPath", () => {
  it("resolves a sibling file", () => {
    expect(resolveRelPath("ppt/slides/slide1.xml", "../slideLayouts/slideLayout1.xml")).toBe(
      "ppt/slideLayouts/slideLayout1.xml"
    );
  });

  it("resolves a file in the same directory", () => {
    expect(resolveRelPath("ppt/slides/slide1.xml", "slide2.xml")).toBe("ppt/slides/slide2.xml");
  });

  it("handles multiple parent traversals", () => {
    expect(resolveRelPath("a/b/c/file.xml", "../../x.xml")).toBe("a/x.xml");
  });

  it("collapses dot segments", () => {
    expect(resolveRelPath("ppt/slide.xml", "./media/image1.png")).toBe("ppt/media/image1.png");
  });
});

describe("relativePathTo", () => {
  it("returns relative path between files in different directories", () => {
    expect(relativePathTo("ppt/slides/slide1.xml", "ppt/slideLayouts/slideLayout1.xml")).toBe(
      "../slideLayouts/slideLayout1.xml"
    );
  });

  it("returns just filename for same-directory files", () => {
    expect(relativePathTo("ppt/slides/slide1.xml", "ppt/slides/slide2.xml")).toBe("slide2.xml");
  });

  it("handles going up multiple levels", () => {
    expect(relativePathTo("a/b/c/file.xml", "x/y.xml")).toBe("../../../x/y.xml");
  });
});

describe("escapeRegex", () => {
  it("escapes special regex characters", () => {
    expect(escapeRegex("a.b*c+d?")).toBe("a\\.b\\*c\\+d\\?");
  });

  it("escapes brackets and braces", () => {
    expect(escapeRegex("[test]{value}")).toBe("\\[test\\]\\{value\\}");
  });

  it("leaves plain strings unchanged", () => {
    expect(escapeRegex("hello")).toBe("hello");
  });

  it("escapes backslashes", () => {
    expect(escapeRegex("a\\b")).toBe("a\\\\b");
  });
});
