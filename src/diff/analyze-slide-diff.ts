/* global Blob */

import JSZip from "jszip";
import { requireZipText } from "./zip-utils";

type DiffObjectKind = "shape" | "image" | "table" | "chart" | "group" | "connector" | "object";

interface DiffObject {
  id: string;
  kind: DiffObjectKind;
  name: string;
  xml: string;
  styleSignature: string;
  contentSignature: string;
}

interface SlideRef {
  path: string;
}

export interface SlideDiffSummary {
  styleChanges: DiffChange[];
  contentChanges: DiffChange[];
  allChanges: DiffChange[];
}

export type DiffChangeCategory = "style" | "content";

export interface DiffChange {
  id: string;
  category: DiffChangeCategory;
  description: string;
}

const OBJECT_PATTERNS: RegExp[] = [
  /<p:sp\b[\s\S]*?<\/p:sp>/g,
  /<p:pic\b[\s\S]*?<\/p:pic>/g,
  /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g,
  /<p:cxnSp\b[\s\S]*?<\/p:cxnSp>/g,
  /<p:grpSp\b[\s\S]*?<\/p:grpSp>/g,
  /<p:contentPart\b[\s\S]*?<\/p:contentPart>/g,
  /<p:contentPart\b[^>]*\/>/g,
];

function normalize(xml: string): string {
  return xml.replace(/\s+/g, " ").trim();
}

function shortName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 40) {
    return trimmed;
  }
  return `${trimmed.slice(0, 37)}...`;
}

function extractSlideRefs(presentationXml: string, relsXml: string): SlideRef[] {
  const idMatches = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)];
  const relMatches = [
    ...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g),
  ];
  const relMap = new Map(relMatches.map((m) => [m[1], m[2]]));

  return idMatches
    .map((m) => m[1])
    .map((rId) => relMap.get(rId))
    .filter((target): target is string => typeof target === "string")
    .map((target) => ({ path: target.startsWith("ppt/") ? target : `ppt/${target}` }));
}

function extractSpTree(slideXml: string): string {
  const match = slideXml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/);
  if (!match) {
    return "";
  }

  let content = match[1];
  content = content.replace(/<p:nvGrpSpPr>[\s\S]*?<\/p:nvGrpSpPr>\s*/, "");
  content = content.replace(/<p:grpSpPr>[\s\S]*?<\/p:grpSpPr>\s*/, "");
  return content;
}

function detectKind(xml: string): DiffObjectKind {
  if (xml.startsWith("<p:pic")) {
    return "image";
  }

  if (xml.startsWith("<p:cxnSp")) {
    return "connector";
  }

  if (xml.startsWith("<p:grpSp")) {
    return "group";
  }

  if (xml.startsWith("<p:graphicFrame")) {
    if (/drawingml\/2006\/table/.test(xml)) {
      return "table";
    }
    if (/drawingml\/2006\/chart/.test(xml)) {
      return "chart";
    }
    return "object";
  }

  if (xml.startsWith("<p:sp")) {
    return "shape";
  }

  return "object";
}

function extractObjectId(xml: string): string | null {
  const match = xml.match(/\bcNvPr[^>]*\bid="(\d+)"/);
  return match ? match[1] : null;
}

function extractObjectName(xml: string, kind: DiffObjectKind, id: string): string {
  const match = xml.match(/\bcNvPr[^>]*\bname="([^"]+)"/);
  if (match && match[1].trim().length > 0) {
    return shortName(match[1]);
  }

  const kindLabel =
    kind === "table"
      ? "Table"
      : kind === "chart"
        ? "Chart"
        : kind === "image"
          ? "Image"
          : kind === "connector"
            ? "Connector"
            : kind === "group"
              ? "Group"
              : kind === "shape"
                ? "Shape"
                : "Object";

  return `${kindLabel} ${id}`;
}

function buildStyleSignature(xml: string): string {
  const styleParts = [
    ...xml.matchAll(/<p:spPr\b[\s\S]*?<\/p:spPr>/g),
    ...xml.matchAll(/<p:style\b[\s\S]*?<\/p:style>/g),
    ...xml.matchAll(/<(?:a|p):xfrm\b[\s\S]*?<\/(?:a|p):xfrm>/g),
  ]
    .map((m) => m[0])
    .join("|");

  return normalize(styleParts);
}

function buildContentSignature(xml: string): string {
  const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("\0");
  const relRefs = [...xml.matchAll(/\br:(?:id|embed|link)="([^"]+)"/g)].map((m) => m[1]);
  const relPart = relRefs.sort((a, b) => a.localeCompare(b)).join("|");

  const normalizedWithoutStyle = normalize(
    xml
      .replace(/<p:spPr\b[\s\S]*?<\/p:spPr>/g, "")
      .replace(/<(?:a|p):xfrm\b[\s\S]*?<\/(?:a|p):xfrm>/g, "")
      .replace(/<p:style\b[\s\S]*?<\/p:style>/g, "")
  );

  return `${text}|${relPart}|${normalizedWithoutStyle}`;
}

function collectObjects(spTreeXml: string): Map<string, DiffObject> {
  const map = new Map<string, DiffObject>();

  for (const pattern of OBJECT_PATTERNS) {
    for (const match of spTreeXml.matchAll(pattern)) {
      const objectXml = match[0];
      const id = extractObjectId(objectXml);
      if (!id) {
        continue;
      }

      const kind = detectKind(objectXml);
      map.set(id, {
        id,
        kind,
        name: extractObjectName(objectXml, kind, id),
        xml: objectXml,
        styleSignature: buildStyleSignature(objectXml),
        contentSignature: buildContentSignature(objectXml),
      });
    }
  }

  return map;
}

function kindLabel(kind: DiffObjectKind): string {
  if (kind === "table") return "table";
  if (kind === "chart") return "chart";
  if (kind === "image") return "image";
  if (kind === "connector") return "connector";
  if (kind === "group") return "group";
  if (kind === "shape") return "shape";
  return "object";
}

function kindLabelTitle(kind: DiffObjectKind): string {
  const label = kindLabel(kind);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function limit(items: DiffChange[], max: number, category: DiffChangeCategory): DiffChange[] {
  if (items.length <= max) {
    return items;
  }

  const remaining = items.length - max;
  return [
    ...items.slice(0, max),
    {
      id: `overflow-${category}`,
      category,
      description: `+${remaining} more changes`,
    },
  ];
}

export async function analyzeSlideDiff(
  toBlob: Blob,
  fromBlob: Blob,
  slideIndex: number
): Promise<SlideDiffSummary> {
  const [toZip, fromZip] = await Promise.all([
    JSZip.loadAsync(await toBlob.arrayBuffer()),
    JSZip.loadAsync(await fromBlob.arrayBuffer()),
  ]);

  const [toPresentationXml, toRelsXml] = await Promise.all([
    requireZipText(toZip, "ppt/presentation.xml"),
    requireZipText(toZip, "ppt/_rels/presentation.xml.rels"),
  ]);
  const [fromPresentationXml, fromRelsXml] = await Promise.all([
    requireZipText(fromZip, "ppt/presentation.xml"),
    requireZipText(fromZip, "ppt/_rels/presentation.xml.rels"),
  ]);

  const toSlides = extractSlideRefs(toPresentationXml, toRelsXml);
  const fromSlides = extractSlideRefs(fromPresentationXml, fromRelsXml);

  const toSlide = toSlides[slideIndex];
  const fromSlide = fromSlides[slideIndex];
  if (!toSlide || !fromSlide) {
    return { styleChanges: [], contentChanges: [], allChanges: [] };
  }

  const [toSlideXml, fromSlideXml] = await Promise.all([
    requireZipText(toZip, toSlide.path),
    requireZipText(fromZip, fromSlide.path),
  ]);

  const toObjects = collectObjects(extractSpTree(toSlideXml));
  const fromObjects = collectObjects(extractSpTree(fromSlideXml));

  const styleChanges: DiffChange[] = [];
  const contentChanges: DiffChange[] = [];
  const allIds = new Set<string>([...toObjects.keys(), ...fromObjects.keys()]);

  for (const id of allIds) {
    const fromObj = fromObjects.get(id);
    const toObj = toObjects.get(id);

    if (!fromObj && toObj) {
      contentChanges.push({
        id,
        category: "content",
        description: `Added ${kindLabel(toObj.kind)}`,
      });
      continue;
    }

    if (fromObj && !toObj) {
      contentChanges.push({
        id,
        category: "content",
        description: `Deleted ${kindLabel(fromObj.kind)}`,
      });
      continue;
    }

    if (!fromObj || !toObj) {
      continue;
    }

    if (fromObj.styleSignature !== toObj.styleSignature) {
      styleChanges.push({
        id,
        category: "style",
        description: `${kindLabelTitle(toObj.kind)} appearance changed`,
      });
    }

    if (fromObj.contentSignature !== toObj.contentSignature) {
      contentChanges.push({
        id,
        category: "content",
        description: `${kindLabelTitle(toObj.kind)} content changed`,
      });
    }
  }

  const limitedStyleChanges = limit(styleChanges, 5, "style");
  const limitedContentChanges = limit(contentChanges, 5, "content");

  return {
    styleChanges: limitedStyleChanges,
    contentChanges: limitedContentChanges,
    allChanges: [...limitedStyleChanges, ...limitedContentChanges],
  };
}
