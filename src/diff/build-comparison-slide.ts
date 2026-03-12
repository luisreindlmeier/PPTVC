/* global Blob */

import JSZip from "jszip";

interface SlideSize {
  cx: number;
  cy: number;
}

// Layout constants (EMUs: 1 inch = 914400, 1 pt ≈ 12700)
const GAP_ABOVE_LABEL = 457200; // 0.5 in — breathing room below main slide
const PANEL_VPAD = 228600; // 0.25 in — top/bottom padding inside panel
const PANEL_TITLE_H = 330200; // 0.36 in — "Comparing" title row height
const PANEL_SECTION_GAP = 76200; // 0.083 in — tighter gap between title and version row
const PANEL_VERSION_H = 355600; // 0.39 in — version box row height
const LABEL_HEIGHT = PANEL_VPAD + PANEL_TITLE_H + PANEL_SECTION_GAP + PANEL_VERSION_H + PANEL_VPAD;
const GAP_BELOW_LABEL = 152400; // 0.167 in — space before comparison
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
 * Full-width beige panel between the main slide and the comparison area.
 * Contains a "Comparing" headline with a horizontal divider, then two version
 * chips (from = muted, to = highlighted brown) — read-only, all shapes locked.
 */
function buildLabelShape(size: SlideSize, toName: string, fromName: string): string {
  const groupY = size.cy + GAP_ABOVE_LABEL;
  const hPad = 304800; // 0.33 in horizontal padding
  const boxW = 2743200; // 3.0 in fixed chip width to keep both labels compact and left aligned
  const arrowW = 228600; // 0.25 in
  const arrowGap = 76200; // 0.083 in gap on each side of arrow

  // Row Y positions (absolute slide coordinates)
  const titleY = groupY + PANEL_VPAD;
  const versionRowY = titleY + PANEL_TITLE_H + PANEL_SECTION_GAP;

  // Divider: horizontal line, vertically centered in title row, from after label to near right edge
  const titleLabelW = 1143000; // ~1.25 in — enough for "Comparing"
  const dividerX = hPad + titleLabelW + 76200;
  const dividerW = size.cx - hPad - dividerX;
  const dividerY = titleY + Math.round(PANEL_TITLE_H / 2) - 9525;
  const dividerH = 19050; // ~0.021 in

  // Version boxes: compact chips anchored to the left, with arrow between them
  const box1X = hPad;
  const arrowX = box1X + boxW + arrowGap;
  const box2X = arrowX + arrowW + arrowGap;

  const spLocks = `<a:spLocks noSelect="1" noMove="1" noResize="1" noTextEdit="1"/>`;

  // Background panel — beige fill, full slide width
  const bg =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9910" name="PPTVC_PANEL_BG"/>` +
    `<p:cNvSpPr>${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="0" y="${groupY}"/><a:ext cx="${size.cx}" cy="${LABEL_HEIGHT}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="F3EDE2"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`;

  // "Comparing" title text
  const title =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9911" name="PPTVC_TITLE"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${hPad}" y="${titleY}"/><a:ext cx="${titleLabelW}" cy="${PANEL_TITLE_H}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="1100" b="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="5D4E37"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>Comparing</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  // Horizontal divider line after title
  const divider =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9912" name="PPTVC_DIVIDER"/>` +
    `<p:cNvSpPr>${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${dividerX}" y="${dividerY}"/><a:ext cx="${dividerW}" cy="${dividerH}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="D4C9B8"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`;

  // From-version chip — white with muted border, grey text
  const fromBox =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9913" name="PPTVC_FROM_BOX"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${box1X}" y="${versionRowY}"/><a:ext cx="${boxW}" cy="${PANEL_VERSION_H}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12500"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln w="19050"><a:solidFill><a:srgbClr val="D4C9B8"/></a:solidFill></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="152400" rIns="152400" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="0" dirty="0">` +
    `<a:solidFill><a:srgbClr val="7A7060"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>${escapeXml(fromName)}</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  // Arrow "→" between chips
  const arrow =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9914" name="PPTVC_ARROW"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${arrowX}" y="${versionRowY}"/><a:ext cx="${arrowW}" cy="${PANEL_VERSION_H}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="ctr"/>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="0" dirty="0">` +
    `<a:solidFill><a:srgbClr val="7A7060"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>&#x2192;</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  // To-version chip — brown fill, cream text (highlighted as current)
  const toBox =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9915" name="PPTVC_TO_BOX"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${box2X}" y="${versionRowY}"/><a:ext cx="${boxW}" cy="${PANEL_VERSION_H}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12500"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="5D4E37"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="152400" rIns="152400" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="0" dirty="0">` +
    `<a:solidFill><a:srgbClr val="F7F4EF"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>${escapeXml(toName)}</a:t></a:r>` +
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
    `<a:off x="0" y="${groupY}"/>` +
    `<a:ext cx="${size.cx}" cy="${LABEL_HEIGHT}"/>` +
    `<a:chOff x="0" y="${groupY}"/>` +
    `<a:chExt cx="${size.cx}" cy="${LABEL_HEIGHT}"/>` +
    `</a:xfrm>` +
    `</p:grpSpPr>` +
    bg +
    title +
    divider +
    fromBox +
    arrow +
    toBox +
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
    `<p:cNvGrpSpPr><a:grpSpLocks noSelect="1" noResize="1" noMove="1"/></p:cNvGrpSpPr>` +
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
