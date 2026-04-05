/* global Office, crypto */

const VERSION_ROOT_PREFIX = "versions";
const DOCUMENT_SCOPE_SETTING_KEY = "gedonus.documentScopeId";
const LEGACY_DOCUMENT_SCOPE_SETTING_KEY = `${"ppt"}vc.documentScopeId`;

let volatileDocumentScopeId: string | null = null;

function getDocumentUrl(): string {
  if (typeof Office === "undefined") {
    return "";
  }

  const documentUrl = Office.context.document.url;
  if (typeof documentUrl !== "string") {
    return "";
  }

  return documentUrl;
}

function createHash(input: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  const randomSuffix = Math.random().toString(16).slice(2, 18);
  return `${Date.now().toString(16)}${randomSuffix}`;
}

function getDocumentSettings(): Office.Settings | null {
  if (typeof Office === "undefined") {
    return null;
  }

  return Office.context?.document?.settings ?? null;
}

function saveSettingsAsync(settings: Office.Settings): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    settings.saveAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Failed) {
        reject(new Error(result.error.message));
        return;
      }

      resolve();
    });
  });
}

async function getOrCreatePersistedScopeId(): Promise<string | null> {
  const settings = getDocumentSettings();
  if (!settings) {
    return null;
  }

  const currentValue = settings.get(DOCUMENT_SCOPE_SETTING_KEY);
  if (typeof currentValue === "string" && currentValue.trim().length > 0) {
    return currentValue.trim();
  }

  // Backward compatibility: migrate legacy key so existing document histories remain accessible.
  const legacyValue = settings.get(LEGACY_DOCUMENT_SCOPE_SETTING_KEY);
  if (typeof legacyValue === "string" && legacyValue.trim().length > 0) {
    const migratedScopeId = legacyValue.trim();
    settings.set(DOCUMENT_SCOPE_SETTING_KEY, migratedScopeId);
    try {
      await saveSettingsAsync(settings);
      return migratedScopeId;
    } catch {
      return migratedScopeId;
    }
  }

  const newScopeId = createRandomId();
  settings.set(DOCUMENT_SCOPE_SETTING_KEY, newScopeId);

  try {
    await saveSettingsAsync(settings);
    return newScopeId;
  } catch {
    return null;
  }
}

function getOrCreateVolatileScopeId(): string {
  if (!volatileDocumentScopeId) {
    volatileDocumentScopeId = createRandomId();
  }

  return volatileDocumentScopeId;
}

export async function getVersionRootPath(): Promise<string> {
  const documentUrl = getDocumentUrl().trim();
  if (documentUrl.length > 0) {
    return `${VERSION_ROOT_PREFIX}/by-url-${createHash(documentUrl)}`;
  }

  const persistedScopeId = await getOrCreatePersistedScopeId();
  if (persistedScopeId) {
    return `${VERSION_ROOT_PREFIX}/by-doc-${persistedScopeId}`;
  }

  return `${VERSION_ROOT_PREFIX}/by-session-${getOrCreateVolatileScopeId()}`;
}
