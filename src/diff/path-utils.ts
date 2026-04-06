/** Returns the directory portion of a path, including the trailing slash. Returns `""` for a bare filename with no directory separator. */
export function dirOf(path: string): string {
  return path.substring(0, path.lastIndexOf("/") + 1);
}

/** Returns the last path segment after the final `/`. */
export function basenameOf(path: string): string {
  return path.substring(path.lastIndexOf("/") + 1);
}

/** Computes the OOXML `.rels` sidecar path for any PPTX part. E.g. `ppt/slides/slide1.xml` → `ppt/slides/_rels/slide1.xml.rels`. */
export function relsPathOf(filePath: string): string {
  return `${dirOf(filePath)}_rels/${basenameOf(filePath)}.rels`;
}

/** Resolves a relative href against a context file path, collapsing `..` and `.` segments. Mirrors the resolution semantics used by OOXML relationship targets. */
export function resolveRelPath(contextPath: string, relative: string): string {
  const parts = (dirOf(contextPath) + relative).split("/");
  const out: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      out.pop();
    } else if (part && part !== ".") {
      out.push(part);
    }
  }

  return out.join("/");
}

/** Computes the relative path from one OOXML part to another. Inverse of `resolveRelPath`. Used when rewriting relationship targets during resource copying. */
export function relativePathTo(fromFile: string, toFile: string): string {
  const fromParts = dirOf(fromFile).split("/").filter(Boolean);
  const toParts = toFile.split("/").filter(Boolean);
  let index = 0;

  while (
    index < fromParts.length &&
    index < toParts.length &&
    fromParts[index] === toParts[index]
  ) {
    index++;
  }

  return "../".repeat(fromParts.length - index) + toParts.slice(index).join("/");
}

/** Escapes all regex metacharacters in `value` so it can be safely used inside `new RegExp(...)`. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
