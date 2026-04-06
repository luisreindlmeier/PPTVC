export interface SlideSize {
  cx: number;
  cy: number;
}

// Layout constants in EMUs (1 inch = 914400)
const GAP_ABOVE_LABEL = 457200;
const PANEL_VPAD = 152400;
const PANEL_TITLE_H = 355600;
const PANEL_SECTION_GAP = 76200;
const PANEL_FIELD_LABEL_H = 101600;
const PANEL_LABEL_TO_FIELD_GAP = 76200;
const PANEL_VERSION_H = 355600;
const LABEL_HEIGHT =
  PANEL_VPAD +
  PANEL_TITLE_H +
  PANEL_SECTION_GAP +
  PANEL_FIELD_LABEL_H +
  PANEL_LABEL_TO_FIELD_GAP +
  PANEL_VERSION_H +
  PANEL_VPAD;
const GAP_BELOW_LABEL = 152400;
const COMPARISON_OFFSET = GAP_ABOVE_LABEL + LABEL_HEIGHT + GAP_BELOW_LABEL;

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseSlideSize(presentationXml: string): SlideSize {
  const match = presentationXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/);
  return match
    ? { cx: parseInt(match[1], 10), cy: parseInt(match[2], 10) }
    : { cx: 12192000, cy: 6858000 };
}

export function buildBgRect(size: SlideSize): string {
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

export function buildLabelShape(
  size: SlideSize,
  toName: string,
  fromName: string,
  toTimestamp: string,
  toAuthor: string
): string {
  const groupY = size.cy + GAP_ABOVE_LABEL;
  const hPad = 228600;
  const boxW = 1828800;
  const arrowW = 254000;
  const arrowGap = 76200;

  const titleY = groupY + PANEL_VPAD;
  const fieldLabelY = titleY + PANEL_TITLE_H + PANEL_SECTION_GAP;
  const versionRowY = fieldLabelY + PANEL_FIELD_LABEL_H + PANEL_LABEL_TO_FIELD_GAP;

  const titleLabelW = 914400;
  const dividerX = hPad + titleLabelW;
  const dividerW = size.cx - hPad - dividerX;
  const dividerY = titleY + Math.round(PANEL_TITLE_H / 2) - 9525;
  const dividerH = 19050;

  const metaW = 1828800;
  const metaX = size.cx - hPad - metaW;
  const metaTimeY = versionRowY + 25400;
  const metaAuthorY = metaTimeY + 152400;

  const box1X = hPad;
  const arrowX = box1X + boxW + arrowGap;
  const box2X = arrowX + arrowW + arrowGap;

  const spLocks = `<a:spLocks noSelect="1" noMove="1" noResize="1" noTextEdit="1"/>`;

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

export function buildCompareGroup(shapeContent: string, size: SlideSize): string {
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

export function injectIntoSpTree(slideXml: string, ...elements: string[]): string {
  return slideXml.replace(/<\/p:spTree>/, `${elements.join("")}</p:spTree>`);
}
