import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  deleteVersion,
  getVersionBlob,
  listVersions,
  restoreVersion,
  saveVersion,
  updateVersionMeta,
  type Version,
} from "../versions";
import type { UserSettings } from "../storage";
import { getDefaultVersionName } from "../taskpane/settings-model";
import { pushVersionsToGitHub } from "../sync/github-sync";

/** Manages version list state and all CRUD operations. `pendingTags` accumulates tags selected before a save. */
export function useVersionManagement(
  settings: UserSettings,
  showStatus: (text: string, isError: boolean) => void
): {
  versions: Version[];
  setVersions: Dispatch<SetStateAction<Version[]>>;
  displayedVersionId: string | null;
  setDisplayedVersionId: Dispatch<SetStateAction<string | null>>;
  pendingTags: string[];
  setPendingTags: Dispatch<SetStateAction<string[]>>;
  loadVersions: () => Promise<Version[]>;
  enforceMaxVersions: () => Promise<void>;
  onSave: (customName: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdateMeta: (id: string, opts: { displayName?: string; tags?: string[] }) => Promise<void>;
} {
  const [versions, setVersions] = useState<Version[]>([]);
  const [displayedVersionId, setDisplayedVersionId] = useState<string | null>(null);
  const [pendingTags, setPendingTags] = useState<string[]>([]);

  const loadVersions = useCallback(async () => {
    const loaded = await listVersions();
    setVersions(loaded);
    setDisplayedVersionId((prev) => {
      if (loaded.length === 0) return null;
      if (prev && loaded.some((v) => v.id === prev)) return prev;
      return loaded[0].id;
    });
    return loaded;
  }, []);

  const enforceMaxVersions = useCallback(async () => {
    const max = settings.maxVersions;
    if (!max || max <= 0) return;
    const all = await listVersions();
    if (all.length <= max) return;
    for (const v of all.slice(max)) await deleteVersion(v.id);
  }, [settings.maxVersions]);

  const onSave = useCallback(
    async (customName: string) => {
      const loaded = await listVersions();
      const nextIndex = loaded.length + 1;
      const defaultName = getDefaultVersionName(nextIndex, settings);
      const version = await saveVersion({
        name: customName || defaultName,
        tags: pendingTags.length > 0 ? [...pendingTags] : [],
        authorName: settings.authorName || undefined,
        authorEmail: settings.email || undefined,
      });

      const syncConfig = settings.githubSync;
      const shouldAutoSync =
        settings.autoSyncOnVersionSave === true &&
        syncConfig !== undefined &&
        syncConfig.repo.trim().length > 0 &&
        syncConfig.installationId !== undefined;

      if (shouldAutoSync) {
        try {
          showStatus("Syncing new version to GitHub...", false);
          const result = await pushVersionsToGitHub(syncConfig, [version], getVersionBlob, () => {
            // Keep status noise low during single-version auto-sync.
          });
          if (result.errors.length > 0) {
            showStatus(`Auto-sync failed: ${result.errors[0]}`, true);
          } else {
            showStatus(`Saved and synced: ${customName || version.name}`, false);
          }
        } catch (error: unknown) {
          showStatus(
            error instanceof Error ? `Auto-sync failed: ${error.message}` : "Auto-sync failed.",
            true
          );
        }
      }

      setDisplayedVersionId(version.id);
      setPendingTags([]);
      if (!shouldAutoSync) {
        showStatus(`Saved: ${customName || version.name}`, false);
      }
      await enforceMaxVersions();
      await loadVersions();
    },
    [settings, pendingTags, enforceMaxVersions, loadVersions, showStatus]
  );

  const onRestore = useCallback(
    async (id: string) => {
      await restoreVersion(id);
      setDisplayedVersionId(id);
      showStatus("Restored successfully.", false);
    },
    [showStatus]
  );

  const onDelete = useCallback(
    async (id: string) => {
      await deleteVersion(id);

      const wasDisplayed = displayedVersionId === id;
      const loaded = await loadVersions();

      if (wasDisplayed) {
        const nextVersion = loaded[0];
        const nextId = nextVersion?.id ?? null;
        setDisplayedVersionId(nextId);

        if (nextVersion) {
          await restoreVersion(nextVersion.id);
        }
      }

      showStatus("Version deleted.", false);
    },
    [displayedVersionId, loadVersions, showStatus]
  );

  const onUpdateMeta = useCallback(
    async (id: string, opts: { displayName?: string; tags?: string[] }) => {
      await updateVersionMeta(id, opts);
      setVersions((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...opts, name: opts.displayName ?? v.name } : v))
      );
    },
    []
  );

  return {
    versions,
    setVersions,
    displayedVersionId,
    setDisplayedVersionId,
    pendingTags,
    setPendingTags,
    loadVersions,
    enforceMaxVersions,
    onSave,
    onRestore,
    onDelete,
    onUpdateMeta,
  };
}
