export function dirOf(path: string): string {
  return path.substring(0, path.lastIndexOf("/") + 1);
}

export function basenameOf(path: string): string {
  return path.substring(path.lastIndexOf("/") + 1);
}

export function relsPathOf(filePath: string): string {
  return `${dirOf(filePath)}_rels/${basenameOf(filePath)}.rels`;
}

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

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
