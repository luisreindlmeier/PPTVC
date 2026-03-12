/* global Blob */

import JSZip from "jszip";

interface SlideSize {
  cx: number;
  cy: number;
}

// Layout constants (EMUs: 1 inch = 914400, 1 pt ≈ 12700)
const GAP_ABOVE_LABEL = 457200; // 0.5 in — breathing room below main slide
const LABEL_BOX_HEIGHT = 406400; // 0.44 in — button height
const LABEL_SUBTEXT_GAP = 114300; // 0.125 in
const LABEL_SUBTEXT_HEIGHT = 304800; // 0.33 in
const LABEL_HEIGHT = LABEL_BOX_HEIGHT + LABEL_SUBTEXT_GAP + LABEL_SUBTEXT_HEIGHT;
const GAP_BELOW_LABEL = 304800; // 0.33 in — space between label and comparison
const COMPARISON_OFFSET = GAP_ABOVE_LABEL + LABEL_HEIGHT + GAP_BELOW_LABEL;

function parseSlideSize(presentationXml: string): SlideSize {
  const match = presentationXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
  return match
    ? { cx: parseInt(match[1], 10), cy: parseInt(match[2], 10) }
    : { cx: 12192000, cy: 6858000 }; // 16:9 widescreen fallback
}

function getSlidePaths(presentationXml: string, relsXml: string): string[] {
  const idMatches = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)];
  const rIds = idMatches.map((m) => m[1]);

  const relMatches = [
    ...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g),
  ];
  const relMap = new Map(relMatches.map((m) => [m[1], m[2]]));

  return rIds
    .map((rId) => relMap.get(rId))
    .filter((p): p is string => p !== undefined)
    .map((p) => (p.startsWith("ppt/") ? p : `ppt/${p}`));
}

function extractShapeContent(slideXml: string): string {
  const treeMatch = slideXml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  if (!treeMatch) return "";

  let content = treeMatch[1];
  content = content.replace(/<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*/g, "");
  content = content.replace(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>\s*/g, "");
  return content.trim();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * White rectangle with subtle drop shadow covering the comparison area.
 * Positioned at y = slideHeight + COMPARISON_OFFSET.
 */
function buildBgRect(size: SlideSize): string {
  const y = size.cy + COMPARISON_OFFSET;
  return (
    `<p:sp>` +
    `<p:nvSpPr>` +
    `<p:cNvPr id="9900" name="PPTVC_BG"/>` +
    `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="0" y="${y}"/><a:ext cx="${size.cx}" cy="${size.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `<a:effectLst>` +
    `<a:outerShdw blurRad="76200" dist="25400" dir="5400000" algn="ctr" rotWithShape="0">` +
    `<a:srgbClr val="2C2820"><a:alpha val="10000"/></a:srgbClr>` +
    `</a:outerShdw>` +
    `</a:effectLst>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`
  );
}

/**
 * Locked group containing a brown button ("Compare Version") and a sub-label
 * showing the from-version name — positioned between the main slide and the
 * comparison area.
 */
function buildLabelShape(size: SlideSize, _toName: string, fromName: string): string {
  // Button width is fixed (~2 inches), centered on slide
  const btnWidth = 1828800; // ~2 in
  const btnX = Math.round((size.cx - btnWidth) / 2);
  const groupY = size.cy + GAP_ABOVE_LABEL;
  const subTextY = groupY + LABEL_BOX_HEIGHT + LABEL_SUBTEXT_GAP;

  // Shared lock attributes for child shapes
  const spLocks = `<a:spLocks noSelect="1" noMove="1" noResize="1" noTextEdit="1"/>`;

  const btn =
    `<p:sp>` +
    `<p:nvSpPr>` +
    `<p:cNvPr id="9902" name="PPTVC_BTN"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${btnX}" y="${groupY}"/><a:ext cx="${btnWidth}" cy="${LABEL_BOX_HEIGHT}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 8333"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="5D4E37"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="114300" rIns="114300" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="0" spc="-100" dirty="0">` +
    `<a:solidFill><a:srgbClr val="F7F4EF"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>Compare Version</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  const sub =
    `<p:sp>` +
    `<p:nvSpPr>` +
    `<p:cNvPr id="9903" name="PPTVC_SUBLABEL"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${btnX}" y="${subTextY}"/><a:ext cx="${btnWidth}" cy="${LABEL_SUBTEXT_HEIGHT}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="t" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/>` +
    `<a:r><a:rPr lang="en-US" sz="900" b="0" dirty="0">` +
    `<a:solidFill><a:srgbClr val="7A7060"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>${escapeXml(fromName)}</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  return (
    `<p:grpSp>` +
    `<p:nvGrpSpPr>` +
    `<p:cNvPr id="9901" name="PPTVC_LABEL_GROUP"/>` +
    `<p:cNvGrpSpPr><a:grpSpLocks noSelect="1" noResize="1" noMove="1"/></p:cNvGrpSpPr>` +
    `<p:nvPr/>` +
    `</p:nvGrpSpPr>` +
    `<p:grpSpPr>` +
    `<a:xfrm>` +
    `<a:off x="${btnX}" y="${groupY}"/>` +
    `<a:ext cx="${btnWidth}" cy="${LABEL_HEIGHT}"/>` +
    `<a:chOff x="${btnX}" y="${groupY}"/>` +
    `<a:chExt cx="${btnWidth}" cy="${LABEL_HEIGHT}"/>` +
    `</a:xfrm>` +
    `</p:grpSpPr>` +
    btn +
    sub +
    `</p:grpSp>`
  );
}

/**
 * Wraps the old slide's shapes in a group offset to the comparison area.
 */
function buildCompareGroup(shapeContent: string, size: SlideSize): string {
  const y = size.cy + COMPARISON_OFFSET;
  return (
    `<p:grpSp>` +
    `<p:nvGrpSpPr>` +
    `<p:cNvPr id="9902" name="PPTVC_SHAPES"/>` +
    `<p:cNvGrpSpPr/>` +
    `<p:nvPr/>` +
    `</p:nvGrpSpPr>` +
    `<p:grpSpPr>` +
    `<a:xfrm>` +
    `<a:off x="0" y="${y}"/>` +
    `<a:ext cx="${size.cx}" cy="${size.cy}"/>` +
    `<a:chOff x="0" y="0"/>` +
    `<a:chExt cx="${size.cx}" cy="${size.cy}"/>` +
    `</a:xfrm>` +
    `</p:grpSpPr>` +
    shapeContent +
    `</p:grpSp>`
  );
}

function injectIntoSpTree(slideXml: string, ...elements: string[]): string {
  return slideXml.replace(/<\/p:spTree>/, `${elements.join("")}</p:spTree>`);
}

/**
 * Builds a modified PPTX where the target slide also shows the reference
 * slide's content below the visible area — with a label and white background.
 *
 * @param toBlob     The "current" / newer version PPTX
 * @param fromBlob   The older / reference version PPTX
 * @param slideIndex 0-based index of the slide to compare
 * @param toName     Display name of the newer version
 * @param fromName   Display name of the older version
 */
export async function buildComparisonSlide(
  toBlob: Blob,
  fromBlob: Blob,
  slideIndex: number,
  toName = "New",
  fromName = "Old"
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
  const bgRect = buildBgRect(slideSize);
  const label = buildLabelShape(slideSize, toName, fromName);
  const compareGroup = buildCompareGroup(oldShapes, slideSize);
  const modifiedSlideXml = injectIntoSpTree(toSlideXml, bgRect, label, compareGroup);

  toZip.file(toSlidePath, modifiedSlideXml);

  return toZip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
