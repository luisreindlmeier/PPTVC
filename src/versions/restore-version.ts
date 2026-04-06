/* global PowerPoint, btoa */

import { createStorageAdapter } from "../storage";
import { getVersionRootPath } from "./document-scope";

const SNAPSHOT_FILE_NAME = "snapshot.pptx";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

/**
 * Restores a saved version by reading its snapshot blob from OPFS, inserting all slides
 * via `insertSlidesFromBase64`, then deleting the pre-existing slides.
 * Throws if the given `id` does not exist in the current document scope.
 */
export async function restoreVersion(id: string): Promise<void> {
  const storage = createStorageAdapter();
  const versionRootPath = await getVersionRootPath();

  const existingVersionIds = await storage.listDirectory(versionRootPath);
  if (!existingVersionIds.includes(id)) {
    throw new Error(`Version "${id}" does not exist.`);
  }

  const snapshotPath = `${versionRootPath}/${id}/${SNAPSHOT_FILE_NAME}`;
  const blob = await storage.readBlob(snapshotPath);
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());

  await PowerPoint.run(async (context) => {
    const existingSlides = context.presentation.slides;
    existingSlides.load("id");
    await context.sync();

    const existingSlideIds = existingSlides.items.map((slide) => slide.id);

    context.presentation.insertSlidesFromBase64(base64, {
      formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting,
    });

    await context.sync();

    for (const slideId of existingSlideIds) {
      context.presentation.slides.getItem(slideId).delete();
    }

    await context.sync();
  });
}
