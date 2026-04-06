import JSZip from "jszip";
import { basenameOf, dirOf, relativePathTo, relsPathOf, resolveRelPath } from "./path-utils";

export interface RelEntry {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
  raw: string;
}

export function parseRelsXml(xml: string): RelEntry[] {
  const entries: RelEntry[] = [];

  for (const match of xml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const raw = match[0];
    const idMatch = raw.match(/\bId="([^"]+)"/);
    const typeMatch = raw.match(/\bType="([^"]+)"/);
    const targetMatch = raw.match(/\bTarget="([^"]+)"/);
    const modeMatch = raw.match(/\bTargetMode="([^"]+)"/);

    if (!idMatch || !typeMatch || !targetMatch) {
      continue;
    }

    entries.push({
      id: idMatch[1],
      type: typeMatch[1],
      target: targetMatch[1],
      targetMode: modeMatch?.[1],
      raw,
    });
  }

  return entries;
}

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

function contentTypeOverrideFor(path: string): string | null {
  if (/\/charts\//.test(path) && path.endsWith(".xml")) {
    const name = basenameOf(path);
    if (name.startsWith("chartStyle")) return "application/vnd.ms-office.chartstyle+xml";
    if (name.startsWith("chartColorStyle")) return "application/vnd.ms-office.chartcolorstyle+xml";
    return "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
  }

  if (/\/embeddings\//.test(path)) {
    if (path.endsWith(".xlsx") || path.endsWith(".xlsm") || path.endsWith(".xltx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (path.endsWith(".bin")) {
      return "application/vnd.openxmlformats-officedocument.oleObject";
    }
  }

  return null;
}

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
  if (!srcChartRelsFile) {
    return;
  }

  const srcChartRelsXml = await srcChartRelsFile.async("string");
  const entries = parseRelsXml(srcChartRelsXml);
  let updatedRelsXml = srcChartRelsXml;

  for (const rel of entries) {
    if (rel.targetMode === "External") {
      continue;
    }

    const srcSubPath = resolveRelPath(srcChartPath, rel.target);
    const subFile = srcZip.file(srcSubPath);
    if (!subFile) {
      continue;
    }

    const ext = srcSubPath.split(".").pop() ?? "bin";
    const stem = basenameOf(srcSubPath).split(".").slice(0, -1).join(".");
    const destSubPath = dirOf(srcSubPath) + `gedonus_cmp_${stem}_${counter.n}.${ext}`;
    counter.n++;

    destZip.file(destSubPath, await subFile.async("uint8array"));

    const contentType = contentTypeOverrideFor(destSubPath);
    if (contentType) {
      ctOverrides.push({ partName: destSubPath, contentType });
    }

    const newTarget = relativePathTo(destChartPath, destSubPath);
    updatedRelsXml = updatedRelsXml.replace(rel.raw, rel.raw.replace(rel.target, newTarget));
  }

  destZip.file(relsPathOf(destChartPath), updatedRelsXml);
}

export async function copySlideResources(
  srcZip: JSZip,
  destZip: JSZip,
  srcSlidePath: string,
  destSlidePath: string,
  counter: { n: number },
  ctOverrides: Array<{ partName: string; contentType: string }>
): Promise<Map<string, string>> {
  const relationshipIdMap = new Map<string, string>();

  const srcRelsPath = relsPathOf(srcSlidePath);
  const srcRelsFile = srcZip.file(srcRelsPath);
  if (!srcRelsFile) {
    return relationshipIdMap;
  }

  const srcRelsXml = await srcRelsFile.async("string");
  const entries = parseRelsXml(srcRelsXml);

  const destRelsPath = relsPathOf(destSlidePath);
  const destRelsFile = destZip.file(destRelsPath);
  const destRelsXml = destRelsFile
    ? await destRelsFile.async("string")
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  const newEntries: string[] = [];

  for (const rel of entries) {
    if (rel.targetMode === "External") {
      continue;
    }
    if (!isContentRelType(rel.type)) {
      continue;
    }

    const srcContentPath = resolveRelPath(srcSlidePath, rel.target);
    const srcFile = srcZip.file(srcContentPath);
    if (!srcFile) {
      continue;
    }

    const ext = srcContentPath.split(".").pop() ?? "bin";
    const stem = basenameOf(srcContentPath).split(".").slice(0, -1).join(".");
    const destContentPath = dirOf(srcContentPath) + `gedonus_cmp_${stem}_${counter.n}.${ext}`;
    counter.n++;

    destZip.file(destContentPath, await srcFile.async("uint8array"));

    const contentType = contentTypeOverrideFor(destContentPath);
    if (contentType) {
      ctOverrides.push({ partName: destContentPath, contentType });
    }

    if (rel.type.includes("/chart")) {
      await copyChartSubResources(
        srcZip,
        destZip,
        srcContentPath,
        destContentPath,
        counter,
        ctOverrides
      );
    }

    const newRelationshipId = `gedonusR${counter.n++}`;
    relationshipIdMap.set(rel.id, newRelationshipId);

    const newTarget = relativePathTo(destSlidePath, destContentPath);
    newEntries.push(
      `<Relationship Id="${newRelationshipId}" Type="${rel.type}" Target="${newTarget}"/>`
    );
  }

  if (newEntries.length > 0) {
    const updatedRelsXml = destRelsXml.replace(
      "</Relationships>",
      `${newEntries.join("\n")}\n</Relationships>`
    );
    destZip.file(destRelsPath, updatedRelsXml);
  }

  return relationshipIdMap;
}
