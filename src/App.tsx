import { useState, useCallback, useRef, useEffect } from "react";
import {
  listVersions,
  saveVersion,
  restoreVersion,
  deleteVersion,
  updateVersionMeta,
  getVersionBlob,
  exportVersionsZip,
  type Version,
} from "./versions";
import { buildComparisonSlide } from "./diff/build-comparison-slide";
import {
  createStorageAdapter,
  readUserSettings,
  writeUserSettings,
  type UserSettings,
  type GitHubSyncConfig,
} from "./storage";
import { DEFAULT_SETTINGS, getDefaultVersionName, mergeSettings } from "./taskpane/settings-model";
import { formatTimestamp, formatBytes } from "./ui/format";
import { blobToBase64 } from "./lib/binary";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { HistoryPanel } from "./components/HistoryPanel";
import { DiffPanel } from "./components/DiffPanel";
import { SettingsPage } from "./components/SettingsPage";
import { TooltipProvider } from "./components/ui/tooltip";

export type ScopeTab = "history" | "diff" | "workflow";

export interface StatusMessage {
  text: string;
  isError: boolean;
  key: number;
}

export interface SlideInfo {
  num: number;
  name: string;
}

export interface AppState {
  versions: Version[];
  settings: UserSettings;
  currentTab: ScopeTab;
  displayedVersionId: string | null;
  pendingTags: string[];
  currentSlide: SlideInfo;
  status: StatusMessage | null;
  settingsOpen: boolean;
  diffPreselectedId?: string;
}

export function App() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ ...DEFAULT_SETTINGS });
  const [currentTab, setCurrentTab] = useState<ScopeTab>("history");
  const [displayedVersionId, setDisplayedVersionId] = useState<string | null>(null);
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [currentSlide, setCurrentSlide] = useState<SlideInfo>({ num: 1, name: "Slide 1" });
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diffPreselectedId, setDiffPreselectedId] = useState<string | undefined>();
  const autoSaveInProgress = useRef(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((text: string, isError: boolean) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus({ text, isError, key: Date.now() });
    statusTimerRef.current = setTimeout(() => setStatus(null), 4000);
  }, []);

  // ── Load versions ─────────────────────────────────────────────

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

  // ── Enforce max versions ──────────────────────────────────────

  const enforceMaxVersions = useCallback(async () => {
    const max = settings.maxVersions;
    if (!max || max <= 0) return;
    const all = await listVersions();
    if (all.length <= max) return;
    for (const v of all.slice(max)) await deleteVersion(v.id);
  }, [settings.maxVersions]);

  // ── Save ──────────────────────────────────────────────────────

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
      setDisplayedVersionId(version.id);
      setPendingTags([]);
      showStatus(`Saved: ${customName || version.name}`, false);
      await enforceMaxVersions();
      await loadVersions();
    },
    [settings, pendingTags, enforceMaxVersions, loadVersions, showStatus]
  );

  // ── Restore ───────────────────────────────────────────────────

  const onRestore = useCallback(
    async (id: string) => {
      await restoreVersion(id);
      setDisplayedVersionId(id);
      showStatus("Restored successfully.", false);
    },
    [showStatus]
  );

  // ── Delete ────────────────────────────────────────────────────

  const onDelete = useCallback(
    async (id: string) => {
      await deleteVersion(id);
      setVersions((prev) => {
        const next = prev.filter((v) => v.id !== id);
        setDisplayedVersionId((cur) => {
          if (cur !== id) return cur;
          return next[0]?.id ?? null;
        });
        return next;
      });
      showStatus("Version deleted.", false);
    },
    [showStatus]
  );

  // ── Update meta (name/tags) ───────────────────────────────────

  const onUpdateMeta = useCallback(
    async (id: string, opts: { displayName?: string; tags?: string[] }) => {
      await updateVersionMeta(id, opts);
      setVersions((prev) =>
        prev.map((v) => (v.id === id ? { ...v, ...opts, name: opts.displayName ?? v.name } : v))
      );
    },
    []
  );

  // ── Replace presentation (for diff) ──────────────────────────

  const replacePresentationFromBase64 = useCallback(async (base64: string) => {
    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides;
      slides.load("items/id");
      await context.sync();
      const existingIds = slides.items.map((s) => s.id);
      context.presentation.insertSlidesFromBase64(base64, {
        formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting,
      });
      await context.sync();
      for (const id of existingIds) context.presentation.slides.getItem(id).delete();
      await context.sync();
    });
  }, []);

  // ── Tab switching ─────────────────────────────────────────────

  const switchTab = useCallback((tab: ScopeTab, preselectedId?: string) => {
    setCurrentTab(tab);
    if (tab === "diff") setDiffPreselectedId(preselectedId);
  }, []);

  // ── Settings ──────────────────────────────────────────────────

  const onSettingsChange = useCallback(async (next: UserSettings) => {
    setSettings(next);
    await writeUserSettings(next);
  }, []);

  // ── Storage usage ─────────────────────────────────────────────

  const calculateStorageUsage = useCallback(async (): Promise<number> => {
    const storage = createStorageAdapter();
    const all = await listVersions();
    let total = 0;
    for (const v of all) {
      const snap = await getVersionBlob(v.snapshotPath);
      total += snap.size;
      try {
        const meta = await storage.readBlob(v.metadataPath);
        total += meta.size;
      } catch {}
    }
    return total;
  }, []);

  // ── Export ZIP ────────────────────────────────────────────────

  const onExportZip = useCallback(async () => {
    const zipBlob = await exportVersionsZip();
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gedonus-backup-${stamp}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  // ── Auto-save ─────────────────────────────────────────────────

  const registerAutoSave = useCallback(() => {
    Office.context.document.addHandlerAsync(
      "documentBeforeSave" as unknown as Office.EventType,
      (eventArgs: { completed: () => void }) => {
        if (!settings.autoSaveOnDocumentSave || autoSaveInProgress.current) {
          eventArgs.completed();
          return;
        }
        autoSaveInProgress.current = true;
        void (async () => {
          try {
            const loaded = await listVersions();
            const name = getDefaultVersionName(loaded.length + 1, settings);
            await saveVersion({ name, tags: [], authorName: settings.authorName || undefined });
            await enforceMaxVersions();
            await loadVersions();
            showStatus(`Auto-saved: ${name}`, false);
          } catch (err) {
            showStatus(err instanceof Error ? err.message : "Auto-save failed.", true);
          } finally {
            autoSaveInProgress.current = false;
            eventArgs.completed();
          }
        })();
      }
    );
  }, [settings, enforceMaxVersions, loadVersions, showStatus]);

  // ── Slide tracking ────────────────────────────────────────────

  const initSlideTracking = useCallback(() => {
    const updateSlide = () => {
      Office.context.document.getSelectedDataAsync(
        Office.CoercionType.SlideRange,
        (result: Office.AsyncResult<{ slides?: { index: number; title: string }[] }>) => {
          const slide = result.value?.slides?.[0];
          if (result.status === Office.AsyncResultStatus.Succeeded && slide) {
            const num = Math.max(1, slide.index);
            setCurrentSlide({ num, name: `Slide ${num}` });
          }
        }
      );
    };
    updateSlide();
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, updateSlide);
  }, []);

  // ── Init ──────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const stored = await readUserSettings();
        const merged = mergeSettings(stored);
        setSettings(merged);
      } catch {}
      await loadVersions();
      registerAutoSave();
      initSlideTracking();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getVersionName = (v: Version) => v.displayName ?? v.name;
  const getAuthorLabel = (v: Version) =>
    v.authorName?.trim() || settings.authorName?.trim() || "Unknown";

  return (
    <TooltipProvider>
      <div className="relative flex flex-col h-screen app-root">
        <Header currentSlide={currentSlide} />

        <TabBar currentTab={currentTab} onTabChange={switchTab} />

        {/* ── History ─────────────────────────────────────────── */}
        {currentTab === "history" && (
          <HistoryPanel
            versions={versions}
            settings={settings}
            displayedVersionId={displayedVersionId}
            pendingTags={pendingTags}
            onPendingTagsChange={setPendingTags}
            onSave={onSave}
            onRestore={onRestore}
            onDelete={onDelete}
            onUpdateMeta={onUpdateMeta}
            onViewDiff={(id) => switchTab("diff", id)}
            getVersionName={getVersionName}
            getAuthorLabel={getAuthorLabel}
          />
        )}

        {/* ── Diff ─────────────────────────────────────────────── */}
        {currentTab === "diff" && (
          <DiffPanel
            versions={versions}
            currentSlide={currentSlide}
            preselectedId={diffPreselectedId}
            getVersionName={getVersionName}
            getVersionBlob={getVersionBlob}
            buildComparisonSlide={buildComparisonSlide}
            blobToBase64={blobToBase64}
            replacePresentationFromBase64={replacePresentationFromBase64}
            restoreVersionById={restoreVersion}
            formatTimestamp={formatTimestamp}
            getAuthorLabel={getAuthorLabel}
            showStatus={showStatus}
          />
        )}

        {/* ── Workflow ─────────────────────────────────────────── */}
        {currentTab === "workflow" && (
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-[var(--color-text-muted)] text-sm">Workflow tools coming soon.</p>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="flex items-center gap-2 px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] mt-auto shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="ready-dot" aria-hidden="true" />
            <span className="text-[11px] text-[var(--color-text-muted)]">Ready</span>
          </div>

          <div
            key={status?.key ?? 0}
            role="status"
            aria-live="polite"
            className={[
              "flex-1 min-w-0 text-center text-[11px] truncate",
              status
                ? status.isError
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text-muted)]"
                : "text-transparent",
            ].join(" ")}
          >
            {status?.text ?? "_"}
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="ml-auto p-1 rounded hover:bg-[var(--color-border)] transition-colors cursor-pointer"
            aria-label="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="w-4 h-4 text-[var(--color-text-muted)]"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
        </footer>

        {/* ── Settings overlay ─────────────────────────────────── */}
        {settingsOpen && (
          <SettingsPage
            settings={settings}
            onSettingsChange={onSettingsChange}
            onClose={() => setSettingsOpen(false)}
            calculateStorageUsage={calculateStorageUsage}
            formatBytes={formatBytes}
            onExportZip={onExportZip}
            showStatus={showStatus}
            onVersionsReload={() => loadVersions().then(() => undefined)}
            enforceMaxVersions={enforceMaxVersions}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
