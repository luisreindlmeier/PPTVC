function ensureNonEditableSpLocks(xml: string): string {
  const withExpandedSelfClosing = xml.replace(
    /<p:cNvSpPr\b([^>]*)\/>/g,
    (_full, attrs: string) => `<p:cNvSpPr${attrs}></p:cNvSpPr>`
  );

  return withExpandedSelfClosing.replace(
    /<p:cNvSpPr\b([^>]*)>([\s\S]*?)<\/p:cNvSpPr>/g,
    (_full, attrs: string, inner: string) => {
      const locks =
        '<a:spLocks noSelect="1" noMove="1" noResize="1" noRot="1" noGrp="1" noTextEdit="1"/>';

      if (/<a:spLocks\b[^>]*\/>/.test(inner)) {
        return `<p:cNvSpPr${attrs}>${inner.replace(/<a:spLocks\b[^>]*\/>/, locks)}</p:cNvSpPr>`;
      }

      return `<p:cNvSpPr${attrs}>${locks}${inner}</p:cNvSpPr>`;
    }
  );
}

function ensureNonEditablePicLocks(xml: string): string {
  const withExpandedSelfClosing = xml.replace(
    /<p:cNvPicPr\b([^>]*)\/>/g,
    (_full, attrs: string) => `<p:cNvPicPr${attrs}></p:cNvPicPr>`
  );

  return withExpandedSelfClosing.replace(
    /<p:cNvPicPr\b([^>]*)>([\s\S]*?)<\/p:cNvPicPr>/g,
    (_full, attrs: string, inner: string) => {
      const locks = '<a:picLocks noSelect="1" noMove="1" noResize="1" noRot="1" noGrp="1"/>';

      if (/<a:picLocks\b[^>]*\/>/.test(inner)) {
        return `<p:cNvPicPr${attrs}>${inner.replace(/<a:picLocks\b[^>]*\/>/, locks)}</p:cNvPicPr>`;
      }

      return `<p:cNvPicPr${attrs}>${locks}${inner}</p:cNvPicPr>`;
    }
  );
}

function ensureNonEditableGraphicFrameLocks(xml: string): string {
  const withExpandedSelfClosing = xml.replace(
    /<p:cNvGraphicFramePr\b([^>]*)\/>/g,
    (_full, attrs: string) => `<p:cNvGraphicFramePr${attrs}></p:cNvGraphicFramePr>`
  );

  return withExpandedSelfClosing.replace(
    /<p:cNvGraphicFramePr\b([^>]*)>([\s\S]*?)<\/p:cNvGraphicFramePr>/g,
    (_full, attrs: string, inner: string) => {
      const locks =
        '<a:graphicFrameLocks noSelect="1" noMove="1" noResize="1" noRot="1" noGrp="1"/>';

      if (/<a:graphicFrameLocks\b[^>]*\/>/.test(inner)) {
        return `<p:cNvGraphicFramePr${attrs}>${inner.replace(/<a:graphicFrameLocks\b[^>]*\/>/, locks)}</p:cNvGraphicFramePr>`;
      }

      return `<p:cNvGraphicFramePr${attrs}>${locks}${inner}</p:cNvGraphicFramePr>`;
    }
  );
}

function ensureNonEditableCxnLocks(xml: string): string {
  const withExpandedSelfClosing = xml.replace(
    /<p:cNvCxnSpPr\b([^>]*)\/>/g,
    (_full, attrs: string) => `<p:cNvCxnSpPr${attrs}></p:cNvCxnSpPr>`
  );

  return withExpandedSelfClosing.replace(
    /<p:cNvCxnSpPr\b([^>]*)>([\s\S]*?)<\/p:cNvCxnSpPr>/g,
    (_full, attrs: string, inner: string) => {
      const locks = '<a:spLocks noSelect="1" noMove="1" noResize="1" noRot="1" noGrp="1"/>';

      if (/<a:spLocks\b[^>]*\/>/.test(inner)) {
        return `<p:cNvCxnSpPr${attrs}>${inner.replace(/<a:spLocks\b[^>]*\/>/, locks)}</p:cNvCxnSpPr>`;
      }

      return `<p:cNvCxnSpPr${attrs}>${locks}${inner}</p:cNvCxnSpPr>`;
    }
  );
}

function ensureNonEditableGroupLocks(xml: string): string {
  const withExpandedSelfClosing = xml.replace(
    /<p:cNvGrpSpPr\b([^>]*)\/>/g,
    (_full, attrs: string) => `<p:cNvGrpSpPr${attrs}></p:cNvGrpSpPr>`
  );

  return withExpandedSelfClosing.replace(
    /<p:cNvGrpSpPr\b([^>]*)>([\s\S]*?)<\/p:cNvGrpSpPr>/g,
    (_full, attrs: string, inner: string) => {
      const locks = '<a:grpSpLocks noSelect="1" noMove="1" noResize="1" noRot="1"/>';

      if (/<a:grpSpLocks\b[^>]*\/>/.test(inner)) {
        return `<p:cNvGrpSpPr${attrs}>${inner.replace(/<a:grpSpLocks\b[^>]*\/>/, locks)}</p:cNvGrpSpPr>`;
      }

      return `<p:cNvGrpSpPr${attrs}>${locks}${inner}</p:cNvGrpSpPr>`;
    }
  );
}

export function lockComparisonObjects(xml: string): string {
  return [
    ensureNonEditableSpLocks,
    ensureNonEditablePicLocks,
    ensureNonEditableGraphicFrameLocks,
    ensureNonEditableCxnLocks,
    ensureNonEditableGroupLocks,
  ].reduce((acc, applyLock) => applyLock(acc), xml);
}
