/* global Blob */

import JSZip from "jszip";

interface SlideSize {
  cx: number;
  cy: number;
}

function parseSlideSize(presentationXml: string): SlideSize {
  const match = presentationXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
  return match
    ? { cx: parseInt(match[1], 10), cy: parseInt(match[2], 10) }
    : { cx: 12192000, cy: 6858000 }; // 16:9 widescreen fallback
}

function getSlidePaths(presentationXml: string, relsXml: string): string[] {
  // r:ids in deck order from sldIdLst
  const idMatches = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)];
  const rIds = idMatches.map((m) => m[1]);

  // Build r:id → file path map from rels
  const relMatches = [
    ...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g),
  ];
  const relMap = new Map(relMatches.map((m) => [m[1], m[2]]));

  return rIds
    .map((rId) => relMap.get(rId))
    .filter((p): p is string => p !== undefined)
    .map((p) => (p.startsWith("ppt/") ? p : `ppt/${p}`));
}

/**
 * Returns all shape XML from inside <p:spTree> (excludes the spTree metadata elements).
 */
function extractShapeContent(slideXml: string): string {
  const treeMatch = slideXml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  if (!treeMatch) return "";

  // Strip nvGrpSpPr and grpSpPr — these belong to the tree root, not shapes
  let content = treeMatch[1];
  content = content.replace(/<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*/g, "");
  content = content.replace(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>\s*/g, "");
  return content.trim();
}

/**
 * Wraps the old slide's shapes in a group positioned at y = slideHeight so
 * they appear directly below the visible slide area in Normal view.
 */
function buildCompareGroup(shapeContent: string, size: SlideSize): string {
  return (
    `<p:grpSp>` +
    `<p:nvGrpSpPr>` +
    `<p:cNvPr id="9901" name="PPTVC_COMPARE"/>` +
    `<p:cNvGrpSpPr/>` +
    `<p:nvPr/>` +
    `</p:nvGrpSpPr>` +
    `<p:grpSpPr>` +
    `<a:xfrm>` +
    `<a:off x="0" y="${size.cy}"/>` +
    `<a:ext cx="${size.cx}" cy="${size.cy}"/>` +
    `<a:chOff x="0" y="0"/>` +
    `<a:chExt cx="${size.cx}" cy="${size.cy}"/>` +
    `</a:xfrm>` +
    `</p:grpSpPr>` +
    shapeContent +
    `</p:grpSp>`
  );
}

function injectIntoSpTree(slideXml: string, groupXml: string): string {
  return slideXml.replace(/<\/p:spTree>/, `${groupXml}</p:spTree>`);
}

/**
 * Builds a modified PPTX where the target slide also contains the
 * corresponding slide from the reference PPTX, offset below the visible area.
 *
 * @param toBlob   The "current" / newer version PPTX
 * @param fromBlob The older / reference version PPTX
 * @param slideIndex 0-based index of the slide to compare
 */
export async function buildComparisonSlide(
  toBlob: Blob,
  fromBlob: Blob,
  slideIndex: number
): Promise<Blob> {
  const [toZip, fromZip] = await Promise.all([
    JSZip.loadAsync(await toBlob.arrayBuffer()),
    JSZip.loadAsync(await fromBlob.arrayBuffer()),
  ]);

  const toPresentationXml = await toZip.file("ppt/presentation.xml")!.async("string");
  const toRelsXml = await toZip.file("ppt/_rels/presentation.xml.rels")!.async("string");
  const slideSize = parseSlideSize(toPresentationXml);
  const toSlidePaths = getSlidePaths(toPresentationXml, toRelsXml);

  const fromPresentationXml = await fromZip.file("ppt/presentation.xml")!.async("string");
  const fromRelsXml = await fromZip.file("ppt/_rels/presentation.xml.rels")!.async("string");
  const fromSlidePaths = getSlidePaths(fromPresentationXml, fromRelsXml);

  const toSlidePath = toSlidePaths[slideIndex];
  const fromSlidePath = fromSlidePaths[slideIndex];

  if (!toSlidePath || !fromSlidePath) {
    throw new Error(`Slide ${slideIndex + 1} not found in one of the selected versions.`);
  }

  const [toSlideXml, fromSlideXml] = await Promise.all([
    toZip.file(toSlidePath)!.async("string"),
    fromZip.file(fromSlidePath)!.async("string"),
  ]);

  const oldShapes = extractShapeContent(fromSlideXml);
  const compareGroup = buildCompareGroup(oldShapes, slideSize);
  const modifiedSlideXml = injectIntoSpTree(toSlideXml, compareGroup);

  toZip.file(toSlidePath, modifiedSlideXml);

  return toZip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
