/* global Blob */

import JSZip from "jszip";

interface SlideSize {
  cx: number;
  cy: number;
}

// Layout constants (EMUs: 1 inch = 914400, 1 pt ≈ 12700)
const GAP_ABOVE_LABEL = 457200; // 0.5 in — breathing room below main slide
const PANEL_VPAD = 152400; // 0.167 in — tighter top/bottom padding inside panel
const PANEL_TITLE_H = 355600; // 0.39 in — slightly larger "Comparing" title row height
const PANEL_SECTION_GAP = 76200; // 0.083 in — compact gap between title and labels row
const PANEL_FIELD_LABEL_H = 101600; // 0.11 in — small field label row above version boxes
const PANEL_LABEL_TO_FIELD_GAP = 76200; // 0.083 in — more spacing from label to box
const PANEL_VERSION_H = 355600; // 0.39 in — version box row height
const LABEL_HEIGHT =
  PANEL_VPAD +
  PANEL_TITLE_H +
  PANEL_SECTION_GAP +
  PANEL_FIELD_LABEL_H +
  PANEL_LABEL_TO_FIELD_GAP +
  PANEL_VERSION_H +
  PANEL_VPAD;
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
  // Remove only the FIRST occurrence — the spTree's own group-level props.
  // Not a global replace: nested <p:grpSp> children also contain these elements
  // and must be preserved.
  content = content.replace(/<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*/, "");
  content = content.replace(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>\s*/, "");
  return content.trim();
}

// ── Resource-copying helpers (for diff: copy FROM slide assets into TO zip) ──

function dirOf(p: string): string {
  return p.substring(0, p.lastIndexOf("/") + 1);
}

function basenameOf(p: string): string {
  return p.substring(p.lastIndexOf("/") + 1);
}

function relsPathOf(filePath: string): string {
  return `${dirOf(filePath)}_rels/${basenameOf(filePath)}.rels`;
}

function resolveRelPath(contextPath: string, relative: string): string {
  const parts = (dirOf(contextPath) + relative).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

function relativePathTo(fromFile: string, toFile: string): string {
  const fromParts = dirOf(fromFile).split("/").filter(Boolean);
  const toParts = toFile.split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  return "../".repeat(fromParts.length - i) + toParts.slice(i).join("/");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface RelEntry {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
  raw: string;
}

function parseRelsXml(xml: string): RelEntry[] {
  const entries: RelEntry[] = [];
  for (const m of xml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const s = m[0];
    const idM = s.match(/\bId="([^"]+)"/);
    const typeM = s.match(/\bType="([^"]+)"/);
    const targetM = s.match(/\bTarget="([^"]+)"/);
    const modeM = s.match(/\bTargetMode="([^"]+)"/);
    if (idM && typeM && targetM) {
      entries.push({
        id: idM[1],
        type: typeM[1],
        target: targetM[1],
        targetMode: modeM?.[1],
        raw: s,
      });
    }
  }
  return entries;
}

// Relationship types that reference content files that must travel with the slide
function isContentRelType(type: string): boolean {
  return (
    type.includes("/relationships/image") ||
    type.includes("/relationships/chart") ||
    type.includes("/relationships/oleObject") ||
    type.includes("/relationships/video") ||
    type.includes("/relationships/audio") ||
    type.includes("/relationships/package") ||
    type.includes("office/2007/relationships/media")
  );
}

// Returns an <Override> content-type string for chart/embedding XML files, or null for others.
function contentTypeOverrideFor(path: string): string | null {
  if (/\/charts\//.test(path) && path.endsWith(".xml")) {
    const name = basenameOf(path);
    if (name.startsWith("chartStyle")) return "application/vnd.ms-office.chartstyle+xml";
    if (name.startsWith("chartColorStyle")) return "application/vnd.ms-office.chartcolorstyle+xml";
    return "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
  }
  if (/\/embeddings\//.test(path)) {
    if (path.endsWith(".xlsx") || path.endsWith(".xlsm") || path.endsWith(".xltx"))
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (path.endsWith(".bin")) return "application/vnd.openxmlformats-officedocument.oleObject";
  }
  return null;
}

/**
 * Copies all content files referenced by srcSlidePath's rels from srcZip into destZip,
 * adds corresponding <Relationship> entries to destSlidePath's rels file, and returns
 * a map of old-rId → new-rId for rewriting shape XML attributes.
 */
async function copySlideResources(
  srcZip: JSZip,
  destZip: JSZip,
  srcSlidePath: string,
  destSlidePath: string,
  counter: { n: number },
  ctOverrides: Array<{ partName: string; contentType: string }>
): Promise<Map<string, string>> {
  const rIdMap = new Map<string, string>();

  const srcRelsPath = relsPathOf(srcSlidePath);
  const srcRelsFile = srcZip.file(srcRelsPath);
  if (!srcRelsFile) return rIdMap;

  const srcRelsXml = await srcRelsFile.async("string");
  const entries = parseRelsXml(srcRelsXml);

  const destRelsPath = relsPathOf(destSlidePath);
  const destRelsFile = destZip.file(destRelsPath);
  const destRelsXml = destRelsFile
    ? await destRelsFile.async("string")
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  const newRelEntries: string[] = [];

  for (const rel of entries) {
    if (rel.targetMode === "External") continue;
    if (!isContentRelType(rel.type)) continue;

    const srcContent = resolveRelPath(srcSlidePath, rel.target);
    const srcFile = srcZip.file(srcContent);
    if (!srcFile) continue;

    // Give the copied file a unique name to avoid colliding with TO zip's existing files
    const ext = srcContent.split(".").pop() ?? "bin";
    const stem = basenameOf(srcContent).split(".").slice(0, -1).join(".");
    const destContent = dirOf(srcContent) + `gedonus_cmp_${stem}_${counter.n}.${ext}`;
    counter.n++;

    destZip.file(destContent, await srcFile.async("uint8array"));

    const ct = contentTypeOverrideFor(destContent);
    if (ct) ctOverrides.push({ partName: destContent, contentType: ct });

    // For charts, also recursively copy chart rels + embeddings
    if (rel.type.includes("/chart")) {
      await copyChartSubResources(srcZip, destZip, srcContent, destContent, counter, ctOverrides);
    }

    const newRId = `gedonusR${counter.n++}`;
    rIdMap.set(rel.id, newRId);

    const newTarget = relativePathTo(destSlidePath, destContent);
    newRelEntries.push(`<Relationship Id="${newRId}" Type="${rel.type}" Target="${newTarget}"/>`);
  }

  if (newRelEntries.length > 0) {
    const updated = destRelsXml.replace(
      "</Relationships>",
      newRelEntries.join("\n") + "\n</Relationships>"
    );
    destZip.file(destRelsPath, updated);
  }

  return rIdMap;
}

/**
 * Copies chart sub-resources (embedded spreadsheets, color-style, chart-style XML)
 * from srcZip into destZip, and writes a remapped rels file for destChartPath.
 */
async function copyChartSubResources(
  srcZip: JSZip,
  destZip: JSZip,
  srcChartPath: string,
  destChartPath: string,
  counter: { n: number },
  ctOverrides: Array<{ partName: string; contentType: string }>
): Promise<void> {
  const srcChartRelsPath = relsPathOf(srcChartPath);
  const srcChartRelsFile = srcZip.file(srcChartRelsPath);
  if (!srcChartRelsFile) return;

  const srcChartRelsXml = await srcChartRelsFile.async("string");
  const entries = parseRelsXml(srcChartRelsXml);

  let updatedRelsXml = srcChartRelsXml;

  for (const rel of entries) {
    if (rel.targetMode === "External") continue;

    const srcSubPath = resolveRelPath(srcChartPath, rel.target);
    const subFile = srcZip.file(srcSubPath);
    if (!subFile) continue;

    const ext = srcSubPath.split(".").pop() ?? "bin";
    const stem = basenameOf(srcSubPath).split(".").slice(0, -1).join(".");
    const destSubPath = dirOf(srcSubPath) + `gedonus_cmp_${stem}_${counter.n}.${ext}`;
    counter.n++;

    destZip.file(destSubPath, await subFile.async("uint8array"));

    const ct = contentTypeOverrideFor(destSubPath);
    if (ct) ctOverrides.push({ partName: destSubPath, contentType: ct });

    const newTarget = relativePathTo(destChartPath, destSubPath);
    updatedRelsXml = updatedRelsXml.replace(rel.raw, rel.raw.replace(rel.target, newTarget));
  }

  destZip.file(relsPathOf(destChartPath), updatedRelsXml);
}

// ── Shape-level diff ──────────────────────────────────────────

interface ShapeMap {
  byId: Map<string, ShapeDescriptor>;
}

type DrawingObjectKind = "sp" | "pic" | "graphicFrame" | "cxnSp" | "grpSp" | "contentPart";

interface ShapeDescriptor {
  id: string;
  kind: DrawingObjectKind;
  fingerprint: string;
}

interface ObjectPattern {
  kind: DrawingObjectKind;
  regex: RegExp;
}

interface TransformBounds {
  x: string;
  y: string;
  cx: string;
  cy: string;
}

const DIFF_OBJECT_PATTERNS: ObjectPattern[] = [
  { kind: "sp", regex: /<p:sp\b[\s\S]*?<\/p:sp>/g },
  { kind: "pic", regex: /<p:pic\b[\s\S]*?<\/p:pic>/g },
  { kind: "graphicFrame", regex: /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g },
  { kind: "cxnSp", regex: /<p:cxnSp\b[\s\S]*?<\/p:cxnSp>/g },
  { kind: "grpSp", regex: /<p:grpSp\b[\s\S]*?<\/p:grpSp>/g },
  { kind: "contentPart", regex: /<p:contentPart\b[^>]*\/>/g },
  { kind: "contentPart", regex: /<p:contentPart\b[\s\S]*?<\/p:contentPart>/g },
];

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function hashBytes(value: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function normalizeXml(xml: string): string {
  return xml.replace(/\s+/g, " ").trim();
}

function extractObjectId(xml: string): string | null {
  const idMatch = xml.match(/\bcNvPr[^>]*\bid="(\d+)"/);
  return idMatch ? idMatch[1] : null;
}

async function loadRelationshipTargetMap(zip: JSZip, path: string): Promise<Map<string, string>> {
  const relsPath = relsPathOf(path);
  const relsFile = zip.file(relsPath);
  if (!relsFile) {
    return new Map<string, string>();
  }

  const relsXml = await relsFile.async("string");
  const entries = parseRelsXml(relsXml);
  const targetMap = new Map<string, string>();

  for (const rel of entries) {
    if (rel.targetMode === "External") {
      continue;
    }
    targetMap.set(rel.id, resolveRelPath(path, rel.target));
  }

  return targetMap;
}

async function hashPartWithDependencies(
  zip: JSZip,
  partPath: string,
  visited: Set<string>
): Promise<string> {
  if (visited.has(partPath)) {
    return "";
  }
  visited.add(partPath);

  const file = zip.file(partPath);
  if (!file) {
    return "";
  }

  let contentHash = "";
  if (partPath.endsWith(".xml") || partPath.endsWith(".rels")) {
    contentHash = hashString(normalizeXml(await file.async("string")));
  } else {
    contentHash = hashBytes(await file.async("uint8array"));
  }

  const relMap = await loadRelationshipTargetMap(zip, partPath);
  const dependencyHashes: string[] = [];
  for (const [, targetPath] of relMap) {
    const dependencyHash = await hashPartWithDependencies(zip, targetPath, visited);
    if (dependencyHash.length > 0) {
      dependencyHashes.push(`${targetPath}:${dependencyHash}`);
    }
  }

  dependencyHashes.sort((left, right) => left.localeCompare(right));
  return hashString(`${partPath}|${contentHash}|${dependencyHashes.join("|")}`);
}

function collectLinkedRelationshipIds(xml: string): string[] {
  const ids = new Set<string>();
  for (const match of xml.matchAll(/\br:(?:id|embed|link)="([^"]+)"/g)) {
    ids.add(match[1]);
  }
  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

async function buildObjectFingerprint(
  objectXml: string,
  kind: DrawingObjectKind,
  relTargetMap: Map<string, string>,
  zip: JSZip
): Promise<string> {
  const normalizedObject = normalizeXml(objectXml.replace(/\bcNvPr([^>]*)\bid="\d+"/g, "cNvPr$1"));
  const textContent = [...objectXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("\0");

  const relationshipHashes: string[] = [];
  const relationshipIds = collectLinkedRelationshipIds(objectXml);
  for (const relationshipId of relationshipIds) {
    const targetPath = relTargetMap.get(relationshipId);
    if (!targetPath) {
      continue;
    }
    const hash = await hashPartWithDependencies(zip, targetPath, new Set<string>());
    if (hash.length > 0) {
      relationshipHashes.push(`${relationshipId}:${hash}`);
    }
  }

  relationshipHashes.sort((left, right) => left.localeCompare(right));
  return hashString(`${kind}|${normalizedObject}|${textContent}|${relationshipHashes.join("|")}`);
}

async function parseShapeMap(
  spTreeContent: string,
  zip: JSZip,
  slidePath: string
): Promise<ShapeMap> {
  const byId = new Map<string, ShapeDescriptor>();
  const relTargetMap = await loadRelationshipTargetMap(zip, slidePath);

  for (const pattern of DIFF_OBJECT_PATTERNS) {
    for (const match of spTreeContent.matchAll(pattern.regex)) {
      const objectXml = match[0];
      const id = extractObjectId(objectXml);
      if (!id) {
        continue;
      }

      const fingerprint = await buildObjectFingerprint(objectXml, pattern.kind, relTargetMap, zip);
      byId.set(id, { id, kind: pattern.kind, fingerprint });
    }
  }

  return { byId };
}

interface DiffResult {
  changedInFrom: Set<string>;
  removedInFrom: Set<string>;
  changedInTo: Set<string>;
  addedInTo: Set<string>;
}

function computeShapeDiff(fromMap: ShapeMap, toMap: ShapeMap): DiffResult {
  const changedInFrom = new Set<string>();
  const removedInFrom = new Set<string>();
  const changedInTo = new Set<string>();
  const addedInTo = new Set<string>();

  for (const [id, fromShape] of fromMap.byId) {
    const toShape = toMap.byId.get(id);
    if (!toShape) {
      removedInFrom.add(id);
    } else if (fromShape.fingerprint !== toShape.fingerprint) {
      changedInFrom.add(id);
    }
  }

  for (const [id, toShape] of toMap.byId) {
    const fromShape = fromMap.byId.get(id);
    if (!fromShape) {
      addedInTo.add(id);
    } else if (fromShape.fingerprint !== toShape.fingerprint) {
      changedInTo.add(id);
    }
  }

  return { changedInFrom, removedInFrom, changedInTo, addedInTo };
}

// Border width 3pt (38100 EMU). Replaces any existing <a:ln> in <p:spPr>.
function addBorderToShapeXml(shapeXml: string, colorHex: string): string {
  const border = `<a:ln w="38100"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:ln>`;
  if (/<a:ln[\s/>]/.test(shapeXml)) {
    return shapeXml.replace(/<a:ln(?:\s[^>]*)?\/>|<a:ln(?:[^>]*)?>[\s\S]*?<\/a:ln>/, border);
  }
  return shapeXml.replace("</p:spPr>", border + "</p:spPr>");
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

function createOverlayBorderShape(bounds: TransformBounds, colorHex: string, idx: number): string {
  return (
    `<p:sp>` +
    `<p:nvSpPr>` +
    `<p:cNvPr id="${9700 + idx}" name="GEDONUS_DIFF_OVERLAY_${idx}"/>` +
    `<p:cNvSpPr><a:spLocks noGrp="1" noRot="1"/></p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${bounds.x}" y="${bounds.y}"/><a:ext cx="${bounds.cx}" cy="${bounds.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/>` +
    `<a:ln w="38100"><a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill></a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`
  );
}

function getDiffColorHex(
  id: string,
  changedIds: Set<string>,
  addedIds: Set<string>,
  removedIds: Set<string>
): string | null {
  if (changedIds.has(id)) {
    return "F59E0B";
  }
  if (addedIds.has(id)) {
    return "22C55E";
  }
  if (removedIds.has(id)) {
    return "EF4444";
  }
  return null;
}

function applyDiffBorders(
  spTreeContent: string,
  changedIds: Set<string>,
  addedIds: Set<string>,
  removedIds: Set<string>
): string {
  let overlayIndex = 0;
  const overlays: string[] = [];

  const applyToObject = (xml: string): string => {
    const id = extractObjectId(xml);
    if (!id) {
      return xml;
    }

    const colorHex = getDiffColorHex(id, changedIds, addedIds, removedIds);
    if (!colorHex) {
      return xml;
    }

    if (canApplyLineBorder(xml)) {
      return addBorderToShapeXml(xml, colorHex);
    }

    const bounds = extractTransformBounds(xml);
    if (!bounds) {
      return xml;
    }

    overlayIndex += 1;
    overlays.push(createOverlayBorderShape(bounds, colorHex, overlayIndex));
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
  addedIds: Set<string>
): string {
  return slideXml.replace(/<p:spTree>([\s\S]*?)<\/p:spTree>/, (_, content: string) => {
    const marked = applyDiffBorders(content, changedIds, addedIds, new Set());
    return `<p:spTree>${marked}</p:spTree>`;
  });
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
    `<p:cNvPr id="9900" name="GEDONUS_BG"/>` +
    `<p:cNvSpPr><a:spLocks noGrp="1" noSelect="1" noMove="1" noResize="1" noRot="1"/></p:cNvSpPr>` +
    `<p:nvPr/>` +
    `</p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="0" y="${y}"/><a:ext cx="${size.cx}" cy="${size.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `<a:effectLst>` +
    `<a:outerShdw blurRad="76200" dist="25400" dir="5400000" algn="ctr" rotWithShape="0">` +
    `<a:srgbClr val="000000"><a:alpha val="8000"/></a:srgbClr>` +
    `</a:outerShdw>` +
    `</a:effectLst>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`
  );
}

/**
 * Full-width neutral panel between the main slide and the comparison area.
 * Contains a "Comparing" headline with a horizontal divider, then two version
 * chips (from = muted, to = highlighted black) — read-only, all shapes locked.
 */
function buildLabelShape(
  size: SlideSize,
  toName: string,
  fromName: string,
  toTimestamp: string,
  toAuthor: string
): string {
  const groupY = size.cy + GAP_ABOVE_LABEL;
  const hPad = 228600; // 0.25 in horizontal padding
  const boxW = 1828800; // 2.0 in fixed chip width to keep both labels compact and left aligned
  const arrowW = 254000; // slightly larger arrow hit-area
  const arrowGap = 76200; // 0.083 in gap on each side of arrow

  // Row Y positions (absolute slide coordinates)
  const titleY = groupY + PANEL_VPAD;
  const fieldLabelY = titleY + PANEL_TITLE_H + PANEL_SECTION_GAP;
  const versionRowY = fieldLabelY + PANEL_FIELD_LABEL_H + PANEL_LABEL_TO_FIELD_GAP;

  // Divider: horizontal line, vertically centered in title row, from after label to near right edge
  const titleLabelW = 914400; // 1.0 in — remove large visual gap before divider
  const dividerX = hPad + titleLabelW;
  const dividerW = size.cx - hPad - dividerX;
  const dividerY = titleY + Math.round(PANEL_TITLE_H / 2) - 9525;
  const dividerH = 19050; // ~0.021 in

  // Right-side meta block (under divider): timestamp above author
  const metaW = 1828800;
  const metaX = size.cx - hPad - metaW;
  const metaTimeY = versionRowY + 25400;
  const metaAuthorY = metaTimeY + 152400;

  // Version boxes: compact chips anchored to the left, with arrow between them
  const box1X = hPad;
  const arrowX = box1X + boxW + arrowGap;
  const box2X = arrowX + arrowW + arrowGap;

  const spLocks = `<a:spLocks noSelect="1" noMove="1" noResize="1" noTextEdit="1"/>`;

  // Background panel — soft neutral fill, full slide width
  const bg =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9910" name="GEDONUS_PANEL_BG"/>` +
    `<p:cNvSpPr>${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="0" y="${groupY}"/><a:ext cx="${size.cx}" cy="${LABEL_HEIGHT}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="F5F5F5"/></a:solidFill>` +
    `<a:ln w="12700"><a:solidFill><a:srgbClr val="E5E5E5"/></a:solidFill></a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`;

  // "Comparing" title text
  const title =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9911" name="GEDONUS_TITLE"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${hPad}" y="${titleY}"/><a:ext cx="${titleLabelW}" cy="${PANEL_TITLE_H}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="1300" b="1" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="171717"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>Comparing</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  // Horizontal divider line after title
  const divider =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9912" name="GEDONUS_DIVIDER"/>` +
    `<p:cNvSpPr>${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${dividerX}" y="${dividerY}"/><a:ext cx="${dividerW}" cy="${dividerH}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="D4D4D4"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>` +
    `</p:sp>`;

  // From-version chip — white with neutral border, muted text
  const fromBox =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9913" name="GEDONUS_FROM_BOX"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${box1X}" y="${versionRowY}"/><a:ext cx="${boxW}" cy="${PANEL_VERSION_H}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12500"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln w="12700"><a:solidFill><a:srgbClr val="D4D4D4"/></a:solidFill></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="101600" rIns="101600" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="950" b="0" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="737373"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>${escapeXml(fromName)}</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  // Arrow "→" between chips
  const arrow =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9914" name="GEDONUS_ARROW"/>` +
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
    `<a:r><a:rPr lang="en-US" sz="1300" b="1" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="737373"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>&#x2192;</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  // To-version chip — black fill, white text (highlighted as current)
  const toBox =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9915" name="GEDONUS_TO_BOX"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${box2X}" y="${versionRowY}"/><a:ext cx="${boxW}" cy="${PANEL_VERSION_H}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12500"/></a:avLst></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="171717"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="101600" rIns="101600" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="950" b="0" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>${escapeXml(toName)}</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  const belowLabel =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9918" name="GEDONUS_BELOW_LABEL"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${box1X}" y="${fieldLabelY}"/><a:ext cx="${boxW}" cy="${PANEL_FIELD_LABEL_H}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="950" b="1" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="525252"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>Below</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  const aboveLabel =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9919" name="GEDONUS_ABOVE_LABEL"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${box2X}" y="${fieldLabelY}"/><a:ext cx="${boxW}" cy="${PANEL_FIELD_LABEL_H}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="l"/>` +
    `<a:r><a:rPr lang="en-US" sz="950" b="1" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="525252"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>Above</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  const timeMeta =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9916" name="GEDONUS_META_TIME"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${metaX}" y="${metaTimeY}"/><a:ext cx="${metaW}" cy="127000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="r"/>` +
    `<a:r><a:rPr lang="en-US" sz="1000" b="0" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="737373"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>${escapeXml(toTimestamp)}</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  const authorMeta =
    `<p:sp>` +
    `<p:nvSpPr><p:cNvPr id="9917" name="GEDONUS_META_AUTHOR"/>` +
    `<p:cNvSpPr txBox="1">${spLocks}</p:cNvSpPr><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${metaX}" y="${metaAuthorY}"/><a:ext cx="${metaW}" cy="127000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:noFill/><a:ln><a:noFill/></a:ln>` +
    `</p:spPr>` +
    `<p:txBody>` +
    `<a:bodyPr anchor="ctr" lIns="0" rIns="0" tIns="0" bIns="0" rtlCol="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>` +
    `<a:p><a:pPr algn="r"/>` +
    `<a:r><a:rPr lang="en-US" sz="900" b="0" noProof="1" dirty="0">` +
    `<a:solidFill><a:srgbClr val="737373"/></a:solidFill>` +
    `<a:latin typeface="+mj-lt"/>` +
    `</a:rPr><a:t>Author: ${escapeXml(toAuthor)}</a:t></a:r>` +
    `</a:p></p:txBody>` +
    `</p:sp>`;

  return (
    `<p:grpSp>` +
    `<p:nvGrpSpPr>` +
    `<p:cNvPr id="9901" name="GEDONUS_LABEL_GROUP"/>` +
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
    belowLabel +
    aboveLabel +
    fromBox +
    arrow +
    toBox +
    timeMeta +
    authorMeta +
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
    `<p:cNvPr id="9902" name="GEDONUS_SHAPES"/>` +
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
  fromName = "Old",
  toTimestamp = "",
  toAuthor = "Unknown"
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

  const rawOldShapes = extractShapeContent(fromSlideXml);

  // ── Shape diff ────────────────────────────────────────────────
  const fromShapeMap = await parseShapeMap(rawOldShapes, fromZip, fromSlidePath);
  const toShapeMap = await parseShapeMap(extractShapeContent(toSlideXml), toZip, toSlidePath);
  const diff = computeShapeDiff(fromShapeMap, toShapeMap);

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
  const markedOldShapes = applyDiffBorders(
    oldShapes,
    diff.changedInFrom,
    new Set<string>(),
    diff.removedInFrom
  );
  // Current slide (above): amber = changed, green = added
  const markedToSlideXml = applyDiffBordersToSlideXml(toSlideXml, diff.changedInTo, diff.addedInTo);

  const bgRect = buildBgRect(slideSize);
  const label = buildLabelShape(slideSize, toName, fromName, toTimestamp, toAuthor);
  const compareGroup = buildCompareGroup(markedOldShapes, slideSize);
  const modifiedSlideXml = injectIntoSpTree(markedToSlideXml, bgRect, label, compareGroup);

  toZip.file(toSlidePath, modifiedSlideXml);

  return toZip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}
