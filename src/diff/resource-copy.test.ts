import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { copySlideResources } from "./resource-copy";

describe("copySlideResources", () => {
  it("appends new relationships when destination rels are self-closing", async () => {
    const srcZip = new JSZip();
    const destZip = new JSZip();

    const srcSlidePath = "ppt/slides/slide1.xml";
    const destSlidePath = "ppt/slides/slide2.xml";

    srcZip.file(
      "ppt/slides/_rels/slide1.xml.rels",
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>\n</Relationships>'
    );
    srcZip.file("ppt/media/image1.png", new Uint8Array([1, 2, 3, 4]));

    destZip.file(
      "ppt/slides/_rels/slide2.xml.rels",
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    );

    const counter = { n: 1 };
    const ctOverrides: Array<{ partName: string; contentType: string }> = [];

    const relationshipIdMap = await copySlideResources(
      srcZip,
      destZip,
      srcSlidePath,
      destSlidePath,
      counter,
      ctOverrides
    );

    const relsAfter = await destZip.file("ppt/slides/_rels/slide2.xml.rels")?.async("string");

    expect(relsAfter).toBeDefined();
    expect(relsAfter).toContain("</Relationships>");
    expect(relsAfter).toContain('Relationship Id="gedonusR2"');
    expect(relationshipIdMap.get("rId1")).toBe("gedonusR2");
    expect(destZip.file("ppt/media/gedonus_cmp_image1_1.png")).toBeDefined();
    expect(ctOverrides).toHaveLength(0);
  });
});
