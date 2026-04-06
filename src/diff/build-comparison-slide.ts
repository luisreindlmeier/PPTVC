/* global Blob */

import JSZip from "jszip";
import {
  buildBgRect,
  buildCompareGroup,
  buildLabelShape,
  injectIntoSpTree,
  parseSlideSize,
} from "./comparison-layout";
import { lockComparisonObjects } from "./object-locks";
import { escapeRegex } from "./path-utils";
import { copySlideResources } from "./resource-copy";
import { computeShapeDiff, DIFF_OBJECT_PATTERNS, extractObjectId } from "./shape-diff";
import { requireZipText } from "./zip-utils";

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
  // Remove only the FIRST occurrence — the spTree's own group-level props.
  // Not a global replace: nested <p:grpSp> children also contain these elements
  // and must be preserved.
  content = content.replace(/<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*/, "");
  content = content.replace(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>\s*/, "");
  return content.trim();
}

// ── Shape-level diff ──────────────────────────────────────────

interface TransformBounds {
  x: string;
  y: string;
  cx: string;
  cy: string;
}

function addBorderToShapeXmlWithAlpha(shapeXml: string, colorHex: string, alpha: number): string {
  // 2pt border for less visual heaviness than the previous 3pt highlight.
  const border =
    `<a:ln w="25400">` +
    `<a:solidFill><a:srgbClr val="${colorHex}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill>` +
    `<a:prstDash val="sysDash"/>` +
    `</a:ln>`;
  if (/<a:ln[\s/>]/.test(shapeXml)) {
    return shapeXml.replace(/<a:ln(?:\s[^>]*)?\/>|<a:ln(?:[^>]*)?>[\s\S]*?<\/a:ln>/, border);
  }
  return shapeXml.replace("</p:spPr>", border + "</p:spPr>");
}

interface DiffVisual {
  colorHex: string;
  statusText: string;
  textColorHex: string;
}

function getDiffVisual(
  id: string,
  changedIds: Set<string>,
  addedIds: Set<string>,
  removedIds: Set<string>
): DiffVisual | null {
  if (changedIds.has(id)) {
    return {
      colorHex: "F59E0B", // orange
      statusText: "Modified",
      textColorHex: "FFFFFF",
    };
  }

  if (addedIds.has(id)) {
    return {
      colorHex: "4ADE80", // slightly darker light green
      statusText: "Added",
      textColorHex: "FFFFFF",
    };
  }

  if (removedIds.has(id)) {
    return {
      colorHex: "EF4444", // red
      statusText: "Deleted",
      textColorHex: "FFFFFF",
    };
  }

  return null;
}

function extractTransformBounds(xml: string): TransformBounds | null {
  const xfrmMatch = xml.match(/<(?:a|p):xfrm\b[\s\S]*?<\/?(?:a|p):xfrm>/);
  if (!xfrmMatch) {
    return null;
  }

  const offMatch = xfrmMatch[0].match(/<(?:a|p):off\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const extMatch = xfrmMatch[0].match(/<(?:a|p):ext\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);

  if (!offMatch || !extMatch) {
    return null;
  }

  return {
    x: offMatch[1],
    y: offMatch[2],
    cx: extMatch[1],
    cy: extMatch[2],
  };
}

function canApplyLineBorder(xml: string): boolean {
  return /<p:spPr\b[\s\S]*?<\/p:spPr>/.test(xml);
}

function createOverlayBorderShapeWithEmphasis(
  bounds: TransformBounds,
  colorHex: string,
  idx: number,
  emphasized: boolean
): string {
  const pad = 15240; // ~1.2pt outward offset to avoid covering the original border
  const x = Math.max(0, toEmuNumber(bounds.x) - pad);
  const y = Math.max(0, toEmuNumber(bounds.y) - pad);
  const cx = Math.max(12700, toEmuNumber(bounds.cx) + pad * 2);
  const cy = Math.max(12700, toEmuNumber(bounds.cy) + pad * 2);
  const fillAlpha = emphasized ? 9000 : 1800;
  const lineAlpha = emphasized ? 100000 : 25000;

  return (
    `<p:sp>` +
    `<p:nvSpPr>` +
    `<p:cNvPr id="${9700 + idx}" name="GEDONUS_DIFF_OVERLAY_${idx}"/>` +
    `<p:cNvSpPr><a:spLocks noGrp="1" noRot="1"/></p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${colorHex}"><a:alpha val="${fillAlpha}"/></a:srgbClr></a:solidFill>` +
    `<a:ln w="25400">` +
    `<a:solidFill><a:srgbClr val="${colorHex}"><a:alpha val="${lineAlpha}"/></a:srgbClr></a:solidFill>` +
    `<a:prstDash val="sysDash"/>` +
    `</a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`
  );
}

function toEmuNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createDiffBadgeShapes(
  bounds: TransformBounds,
  colorHex: string,
  textColorHex: string,
  labelText: string,
  idx: number,
  emphasized: boolean
): string {
  const badgeHeight = 203200;
  // Compact dimensions for short status-only labels.
  const charWidth = 52000;
  const inset = 50800;
  const extraWidth = 25400;
  const estimatedTextWidth = Math.max(228600, labelText.length * charWidth);
  const badgeWidth = estimatedTextWidth + inset * 2 + extraWidth;
  const badgeGap = 38100; // small but visible space between badge and highlight border
  const x = toEmuNumber(bounds.x);
  const y = toEmuNumber(bounds.y);
  const badgeX = Math.max(0, x - 38100);
  const badgeY = Math.max(0, y - badgeHeight - badgeGap);
  const badgeAlpha = emphasized ? 100000 : 32000;
  const textAlpha = emphasized ? 100000 : 45000;

  const badge =
    `<p:sp>` +
    `<p:nvSpPr>` +
    `<p:cNvPr id="${9800 + idx}" name="GEDONUS_DIFF_BADGE_${idx}"/>` +
    `<p:cNvSpPr txBox="1"><a:spLocks noGrp="1" noRot="1"/></p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${badgeX}" y="${badgeY}"/><a:ext cx="${badgeWidth}" cy="${badgeHeight}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 10000"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="${colorHex}"><a:alpha val="${badgeAlpha}"/></a:srgbClr></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" wrap="none" lIns="${inset}" rIns="${inset}" tIns="${inset}" bIns="${inset}" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="760" b="1" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="${textColorHex}"><a:alpha val="${textAlpha}"/></a:srgbClr></a:solidFill>` +
    `<a:latin typeface="Geist"/>` +
    `<a:ea typeface="Geist"/>` +
    `<a:cs typeface="Geist"/>` +
    `</a:rPr><a:t>${escapeXml(labelText)}</a:t></a:r>` +
    `</a:p>` +
    `</p:txBody>` +
    `</p:sp>`;

  return badge;
}

function applyDiffBorders(
  spTreeContent: string,
  changedIds: Set<string>,
  addedIds: Set<string>,
  removedIds: Set<string>,
  idSeed = 0,
  focusIds?: Set<string>
): string {
  let overlayIndex = 0;
  const overlays: string[] = [];

  const applyToObject = (xml: string): string => {
    const id = extractObjectId(xml);
    if (!id) {
      return xml;
    }

    const visual = getDiffVisual(id, changedIds, addedIds, removedIds);
    if (!visual) {
      return xml;
    }

    const emphasized = !focusIds || focusIds.size === 0 || focusIds.has(id);

    const badgeText = visual.statusText.toUpperCase();
    const bounds = extractTransformBounds(xml);
    if (bounds) {
      overlayIndex += 1;
      overlays.push(
        createDiffBadgeShapes(
          bounds,
          visual.colorHex,
          visual.textColorHex,
          badgeText,
          idSeed + overlayIndex,
          emphasized
        )
      );

      overlayIndex += 1;
      overlays.push(
        createOverlayBorderShapeWithEmphasis(
          bounds,
          visual.colorHex,
          idSeed + overlayIndex,
          emphasized
        )
      );
      return xml;
    }

    if (canApplyLineBorder(xml)) {
      return addBorderToShapeXmlWithAlpha(xml, visual.colorHex, emphasized ? 100000 : 28000);
    }

    return xml;
  };

  let updatedSpTree = spTreeContent;
  for (const pattern of DIFF_OBJECT_PATTERNS) {
    updatedSpTree = updatedSpTree.replace(pattern.regex, applyToObject);
  }

  return overlays.length > 0 ? `${updatedSpTree}${overlays.join("")}` : updatedSpTree;
}

function applyDiffBordersToSlideXml(
  slideXml: string,
  changedIds: Set<string>,
  addedIds: Set<string>,
  focusIds?: Set<string>
): string {
  return slideXml.replace(/<p:spTree>([\s\S]*?)<\/p:spTree>/, (_, content: string) => {
    const marked = applyDiffBorders(content, changedIds, addedIds, new Set(), 1000, focusIds);
    return `<p:spTree>${marked}</p:spTree>`;
  });
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
  fromName = "Old",
  toTimestamp = "",
  toAuthor = "Unknown",
  highlightDiffs = true,
  focusedObjectIds: string[] = []
): Promise<Blob> {
  const [toZip, fromZip] = await Promise.all([
    JSZip.loadAsync(await toBlob.arrayBuffer()),
    JSZip.loadAsync(await fromBlob.arrayBuffer()),
  ]);

  const toPresentationXml = await requireZipText(toZip, "ppt/presentation.xml");
  const toRelsXml = await requireZipText(toZip, "ppt/_rels/presentation.xml.rels");
  const slideSize = parseSlideSize(toPresentationXml);
  const toSlidePaths = getSlidePaths(toPresentationXml, toRelsXml);

  const fromPresentationXml = await requireZipText(fromZip, "ppt/presentation.xml");
  const fromRelsXml = await requireZipText(fromZip, "ppt/_rels/presentation.xml.rels");
  const fromSlidePaths = getSlidePaths(fromPresentationXml, fromRelsXml);

  const toSlidePath = toSlidePaths[slideIndex];
  const fromSlidePath = fromSlidePaths[slideIndex];

  if (!toSlidePath || !fromSlidePath) {
    throw new Error(`Slide ${slideIndex + 1} not found in one of the selected versions.`);
  }

  const [toSlideXml, fromSlideXml] = await Promise.all([
    requireZipText(toZip, toSlidePath),
    requireZipText(fromZip, fromSlidePath),
  ]);

  const rawOldShapes = extractShapeContent(fromSlideXml);

  // ── Shape diff ────────────────────────────────────────────────
  const diff = await computeShapeDiff(
    rawOldShapes,
    extractShapeContent(toSlideXml),
    fromZip,
    toZip,
    fromSlidePath,
    toSlidePath
  );

  // ── Copy FROM-slide content resources (images, charts, embeddings) into TO zip ──
  // Without this, the injected shapes reference r:id values that don't exist in
  // the TO slide's .rels file, making the PPTX invalid → insertSlidesFromBase64
  // throws "InvalidArgument".
  const ctOverrides: Array<{ partName: string; contentType: string }> = [];
  const counter = { n: 1 };
  const rIdMap = await copySlideResources(
    fromZip,
    toZip,
    fromSlidePath,
    toSlidePath,
    counter,
    ctOverrides
  );

  // Rewrite every r:id / r:embed / r:link attribute that belongs to copied resources
  let oldShapes = rawOldShapes;
  for (const [oldId, newId] of rIdMap) {
    const pat = new RegExp(`\\br:(id|embed|link)="${escapeRegex(oldId)}"`, "g");
    oldShapes = oldShapes.replace(pat, `r:$1="${newId}"`);
  }

  // Add <Override> content-type entries for any new chart/embedding files
  if (ctOverrides.length > 0) {
    const ctFile = toZip.file("[Content_Types].xml");
    if (ctFile) {
      const ctXml = await ctFile.async("string");
      const overrideXml = ctOverrides
        .map((o) => `<Override PartName="/${o.partName}" ContentType="${o.contentType}"/>`)
        .join("\n");
      toZip.file("[Content_Types].xml", ctXml.replace("</Types>", overrideXml + "\n</Types>"));
    }
  }

  // ── Apply diff borders ────────────────────────────────────────
  // Old shapes (below): amber = changed, red = removed
  const focusIds = focusedObjectIds.length > 0 ? new Set<string>(focusedObjectIds) : undefined;
  const markedOldShapes = highlightDiffs
    ? applyDiffBorders(
        oldShapes,
        diff.changedInFrom,
        new Set<string>(),
        diff.removedInFrom,
        3000,
        focusIds
      )
    : oldShapes;
  const lockedOldShapes = lockComparisonObjects(markedOldShapes);
  // Current slide (above): amber = changed, green = added
  const markedToSlideXml = highlightDiffs
    ? applyDiffBordersToSlideXml(toSlideXml, diff.changedInTo, diff.addedInTo, focusIds)
    : toSlideXml;
  const lockedToSlideXml = lockComparisonObjects(markedToSlideXml);

  const bgRect = buildBgRect(slideSize);
  const label = buildLabelShape(slideSize, toName, fromName, toTimestamp, toAuthor);
  const compareGroup = buildCompareGroup(lockedOldShapes, slideSize);
  const modifiedSlideXml = injectIntoSpTree(lockedToSlideXml, bgRect, label, compareGroup);

  toZip.file(toSlidePath, modifiedSlideXml);

  return toZip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
