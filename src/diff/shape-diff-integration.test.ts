import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { relsPathOf } from "./path-utils";
import { computeShapeDiff } from "./shape-diff";

function makeSpTree(shapes: { id: string; text?: string }[]): string {
  const shapesXml = shapes
    .map(
      ({ id, text }) => `
    <p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${id}" name="Shape ${id}"/>
        <p:cNvSpPr/>
      </p:nvSpPr>
      <p:spPr/>
      <p:txBody>
        <a:bodyPr/>
        <a:p><a:r><a:t>${text ?? ""}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>`
    )
    .join("\n");

  return `<p:spTree xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${shapesXml}</p:spTree>`;
}

function makeZip(slidePath: string): JSZip {
  const zip = new JSZip();
  // Add an empty .rels file so loadRelationshipTargetMap finds nothing and returns an empty map
  zip.file(
    relsPathOf(slidePath),
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
  );
  return zip;
}

const SLIDE = "ppt/slides/slide1.xml";

describe("computeShapeDiff integration", () => {
  it("identical slides produce no diff", async () => {
    const spTree = makeSpTree([{ id: "1", text: "Hello" }]);
    const zip = makeZip(SLIDE);

    const result = await computeShapeDiff(spTree, spTree, zip, zip, SLIDE, SLIDE);

    expect(result.changedInFrom.size).toBe(0);
    expect(result.changedInTo.size).toBe(0);
    expect(result.removedInFrom.size).toBe(0);
    expect(result.addedInTo.size).toBe(0);
  });

  it("added shape appears in addedInTo only", async () => {
    const fromSpTree = makeSpTree([{ id: "1" }]);
    const toSpTree = makeSpTree([{ id: "1" }, { id: "2" }]);
    const zip = makeZip(SLIDE);

    const result = await computeShapeDiff(fromSpTree, toSpTree, zip, zip, SLIDE, SLIDE);

    expect(result.addedInTo.has("2")).toBe(true);
    expect(result.addedInTo.size).toBe(1);
    expect(result.removedInFrom.size).toBe(0);
    expect(result.changedInFrom.size).toBe(0);
    expect(result.changedInTo.size).toBe(0);
  });

  it("removed shape appears in removedInFrom only", async () => {
    const fromSpTree = makeSpTree([{ id: "1" }, { id: "3" }]);
    const toSpTree = makeSpTree([{ id: "1" }]);
    const zip = makeZip(SLIDE);

    const result = await computeShapeDiff(fromSpTree, toSpTree, zip, zip, SLIDE, SLIDE);

    expect(result.removedInFrom.has("3")).toBe(true);
    expect(result.removedInFrom.size).toBe(1);
    expect(result.addedInTo.size).toBe(0);
    expect(result.changedInFrom.size).toBe(0);
    expect(result.changedInTo.size).toBe(0);
  });

  it("changed text appears in changedInFrom and changedInTo", async () => {
    const fromSpTree = makeSpTree([{ id: "5", text: "Original" }]);
    const toSpTree = makeSpTree([{ id: "5", text: "Changed" }]);
    const zip = makeZip(SLIDE);

    const result = await computeShapeDiff(fromSpTree, toSpTree, zip, zip, SLIDE, SLIDE);

    expect(result.changedInFrom.has("5")).toBe(true);
    expect(result.changedInTo.has("5")).toBe(true);
    expect(result.removedInFrom.size).toBe(0);
    expect(result.addedInTo.size).toBe(0);
  });

  it("unchanged shape with same text produces no diff", async () => {
    const spTree = makeSpTree([{ id: "7", text: "Same" }]);
    const zip = makeZip(SLIDE);

    const result = await computeShapeDiff(spTree, spTree, zip, zip, SLIDE, SLIDE);

    expect(result.changedInFrom.size).toBe(0);
    expect(result.changedInTo.size).toBe(0);
    expect(result.removedInFrom.size).toBe(0);
    expect(result.addedInTo.size).toBe(0);
  });
});
