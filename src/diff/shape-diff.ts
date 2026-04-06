import JSZip from "jszip";
import { relsPathOf, resolveRelPath } from "./path-utils";
import { parseRelsXml } from "./resource-copy";

export type DrawingObjectKind = "sp" | "pic" | "graphicFrame" | "cxnSp" | "grpSp" | "contentPart";

interface ShapeDescriptor {
  id: string;
  kind: DrawingObjectKind;
  fingerprint: string;
}

interface ShapeMap {
  byId: Map<string, ShapeDescriptor>;
}

interface ObjectPattern {
  kind: DrawingObjectKind;
  regex: RegExp;
}

export const DIFF_OBJECT_PATTERNS: ObjectPattern[] = [
  { kind: "sp", regex: /<p:sp\b[\s\S]*?<\/p:sp>/g },
  { kind: "pic", regex: /<p:pic\b[\s\S]*?<\/p:pic>/g },
  { kind: "graphicFrame", regex: /<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g },
  { kind: "cxnSp", regex: /<p:cxnSp\b[\s\S]*?<\/p:cxnSp>/g },
  { kind: "grpSp", regex: /<p:grpSp\b[\s\S]*?<\/p:grpSp>/g },
  { kind: "contentPart", regex: /<p:contentPart\b[^>]*\/>/g },
  { kind: "contentPart", regex: /<p:contentPart\b[\s\S]*?<\/p:contentPart>/g },
];

export interface ShapeDiffResult {
  changedInFrom: Set<string>;
  removedInFrom: Set<string>;
  changedInTo: Set<string>;
  addedInTo: Set<string>;
}

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

export function extractObjectId(xml: string): string | null {
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

export async function computeShapeDiff(
  fromSpTreeContent: string,
  toSpTreeContent: string,
  fromZip: JSZip,
  toZip: JSZip,
  fromSlidePath: string,
  toSlidePath: string
): Promise<ShapeDiffResult> {
  const fromMap = await parseShapeMap(fromSpTreeContent, fromZip, fromSlidePath);
  const toMap = await parseShapeMap(toSpTreeContent, toZip, toSlidePath);

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
