import JSZip from "jszip";

export async function requireZipText(zip: JSZip, filePath: string): Promise<string> {
  const file = zip.file(filePath);
  if (!file) {
    throw new Error(`Required PPTX part is missing: ${filePath}`);
  }

  return file.async("string");
}

export async function tryZipText(zip: JSZip, filePath: string): Promise<string | null> {
  const file = zip.file(filePath);
  if (!file) {
    return null;
  }

  return file.async("string");
}
