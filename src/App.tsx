/* global PowerPoint, DOMException, URL, document */

import { Component, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { getVersionBlob, exportVersionsZip, restoreVersion, type Version } from "./versions";
import { buildComparisonSlide } from "./diff/build-comparison-slide";
import { analyzeSlideDiff } from "./diff/analyze-slide-diff";
import { createStorageAdapter } from "./storage";
import type { GitHubSyncConfig, UserSettings } from "./storage";
import { formatTimestamp, formatBytes } from "./ui/format";
import { blobToBase64 } from "./lib/binary";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { HistoryPanel } from "./components/HistoryPanel";
import { DiffPanel } from "./components/DiffPanel";
import { SettingsPage } from "./components/SettingsPage";
import { GitHubOnboardingGate } from "./components/GitHubOnboardingGate";
import { GitHubWelcomeGate } from "./components/GitHubWelcomeGate";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  useStatusMessages,
  useSettings,
  useVersionManagement,
  useOfficeEventHandlers,
} from "./hooks";
import {
  getDocumentScopeKey,
  hasLocalVersioningHint,
  setLocalVersioningHint,
} from "./versions/document-scope";
import type { ScopeTab, SlideInfo } from "./app-types";

export type { ScopeTab, SlideInfo };
export type { StatusMessage } from "./app-types";

class SettingsPageBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)] px-4 text-center">
          <p className="text-[12px] text-[var(--color-text-muted)]">
            Settings could not be loaded. Please reopen the pane.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export function App() {
  const { status, showStatus } = useStatusMessages();
  const { settings, setSettings, onSettingsChange } = useSettings();
  const [documentScopeKey, setDocumentScopeKey] = useState<string | null>(null);
  const [documentScopeReady, setDocumentScopeReady] = useState(false);
  const [documentHasLocalVersioningHint, setDocumentHasLocalVersioningHint] = useState(false);
  const [appInitialized, setAppInitialized] = useState(false);
  const [initialVersionsLoaded, setInitialVersionsLoaded] = useState(false);
  const [githubGateDismissed, setGithubGateDismissed] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"welcome" | "connect">("welcome");

  const activeGitHubSync = useMemo(() => {
    if (!documentScopeKey) return settings.githubSync;
    return settings.githubSyncByDocument?.[documentScopeKey];
  }, [documentScopeKey, settings.githubSync, settings.githubSyncByDocument]);

  const effectiveSettings = useMemo<UserSettings>(
    () => ({
      ...settings,
      githubSync: activeGitHubSync,
    }),
    [activeGitHubSync, settings]
  );

  const onSettingsChangeForDocument = useCallback(
    async (next: UserSettings) => {
      const repo = next.githubSync?.repo.trim() ?? "";
      const normalizedGitHubSync: GitHubSyncConfig | undefined =
        repo.length > 0
          ? {
              ...next.githubSync,
              repo,
              branch: next.githubSync?.branch.trim() || "main",
            }
          : undefined;

      const result: UserSettings = {
        ...next,
        githubSync: normalizedGitHubSync,
        githubAccountName: next.githubAccountName ?? settings.githubAccountName,
        githubAccountConnected:
          next.githubAccountConnected ??
          settings.githubAccountConnected ??
          normalizedGitHubSync?.installationId !== undefined,
      };

      if (documentScopeKey) {
        const byDocument = { ...(next.githubSyncByDocument ?? settings.githubSyncByDocument ?? {}) };
        if (normalizedGitHubSync) {
          byDocument[documentScopeKey] = normalizedGitHubSync;
        } else {
          delete byDocument[documentScopeKey];
        }
        result.githubSyncByDocument = Object.keys(byDocument).length > 0 ? byDocument : undefined;
      }

      if (normalizedGitHubSync?.installationId !== undefined) {
        result.githubAccountConnected = true;
      }

      await onSettingsChange(result);
    },
    [documentScopeKey, onSettingsChange, settings.githubAccountConnected, settings.githubSyncByDocument]
  );

  const {
    versions,
    displayedVersionId,
    pendingTags,
    setPendingTags,
    loadVersions,
    enforceMaxVersions,
    onSave,
    onRestore,
    onDelete,
    onUpdateMeta,
  } = useVersionManagement(effectiveSettings, showStatus);

  const loadVersionsWithReadyFlag = useCallback(async () => {
    try {
      const loaded = await loadVersions();
      if (loaded.length > 0) {
        setDocumentHasLocalVersioningHint(true);
        void setLocalVersioningHint(true);
      } else {
        setDocumentHasLocalVersioningHint(false);
        void setLocalVersioningHint(false);
      }
      return loaded;
    } finally {
      setInitialVersionsLoaded(true);
    }
  }, [loadVersions]);

  const [currentTab, setCurrentTab] = useState<ScopeTab>("history");
  const [currentSlide, setCurrentSlide] = useState<SlideInfo>({ num: 1, name: "Slide 1" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diffPreselectedId, setDiffPreselectedId] = useState<string | undefined>();
  const [hasActiveDiffComparison, setHasActiveDiffComparison] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const scopeKey = await getDocumentScopeKey();
        if (!cancelled) {
          setDocumentScopeKey(scopeKey);
          setDocumentHasLocalVersioningHint(hasLocalVersioningHint());
          setGithubGateDismissed(false);
          setOnboardingStep("welcome");
          setDocumentScopeReady(true);
        }
      } catch {
        if (!cancelled) {
          setDocumentScopeKey("versions/by-session-fallback");
          setDocumentHasLocalVersioningHint(hasLocalVersioningHint());
          setGithubGateDismissed(false);
          setOnboardingStep("welcome");
          setDocumentScopeReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appInitialized) return;

    let cancelled = false;
    const refreshScope = async () => {
      try {
        const nextScope = await getDocumentScopeKey();
        if (cancelled) return;
        setDocumentScopeKey((prev) => {
          if (prev === nextScope) return prev;
          // New presentation detected: rerun onboarding decision flow.
          setGithubGateDismissed(false);
          setOnboardingStep("welcome");
          void loadVersionsWithReadyFlag();
          return nextScope;
        });
      } catch {
        // Ignore transient Office API errors while switching documents.
      }
    };

    const tid = window.setInterval(() => {
      void refreshScope();
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(tid);
    };
  }, [appInitialized]);

  useEffect(() => {
    if (!documentScopeKey) return;
    if (!settings.githubSync) return;
    if (settings.githubSyncByDocument !== undefined) return;

    void onSettingsChange({
      ...settings,
      githubSyncByDocument: {
        [documentScopeKey]: {
          ...settings.githubSync,
          branch: settings.githubSync.branch.trim() || "main",
        },
      },
      githubAccountConnected:
        settings.githubAccountConnected ?? settings.githubSync.installationId !== undefined,
    });
  }, [documentScopeKey, onSettingsChange, settings]);

  const hasDocumentRepo = Boolean(activeGitHubSync?.repo.trim());
  const hasExistingLocalVersioning = documentHasLocalVersioningHint || versions.length > 0;
  const startupReady = appInitialized && documentScopeReady && (documentHasLocalVersioningHint || initialVersionsLoaded);
  const shouldShowGitHubGate =
    startupReady &&
    !settingsOpen &&
    !hasDocumentRepo &&
    !githubGateDismissed &&
    !hasExistingLocalVersioning;
  const shouldShowBootLoading = !startupReady;
  const shouldShowMainView = startupReady && !shouldShowGitHubGate;

  const handleGitHubGateConnected = useCallback(
    async (config: GitHubSyncConfig, accountConnected: boolean, accountLogin?: string) => {
      await onSettingsChangeForDocument({
        ...effectiveSettings,
        githubSync: config,
        githubAccountConnected: accountConnected,
        githubAccountName: accountLogin ?? effectiveSettings.githubAccountName,
      });
      setGithubGateDismissed(true);
      showStatus(`Connected to ${config.repo}.`, false);
    },
    [effectiveSettings, onSettingsChangeForDocument, showStatus]
  );

  const handleGitHubGateSkip = useCallback(() => {
    setGithubGateDismissed(true);
    setOnboardingStep("welcome");
    showStatus("GitHub setup skipped. Local versioning stays available.", false);
  }, [showStatus]);

  const handleStartGitHubConnect = useCallback(() => {
    setOnboardingStep("connect");
  }, []);

  const handleContinueWithoutGitHub = useCallback(() => {
    setGithubGateDismissed(true);
    setOnboardingStep("welcome");
    showStatus("Continuing without GitHub. You can connect later in Settings.", false);
  }, [showStatus]);

  useOfficeEventHandlers({
    setSettings,
    loadVersions: loadVersionsWithReadyFlag,
    showStatus,
    setCurrentSlide,
    onInitialized: () => setAppInitialized(true),
  });

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

  // ── Storage usage ─────────────────────────────────────────────

  const calculateStorageUsage = useCallback(async (): Promise<number> => {
    const storage = createStorageAdapter();
    const all = await loadVersions();
    let total = 0;
    for (const v of all) {
      const snap = await getVersionBlob(v.snapshotPath);
      total += snap.size;
      try {
        const meta = await storage.readBlob(v.metadataPath);
        total += meta.size;
      } catch (error: unknown) {
        if (!isNotFoundError(error)) throw error;
      }
    }
    return total;
  }, [loadVersions]);

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

  // ── Helpers ───────────────────────────────────────────────────

  const getVersionName = (v: Version) => v.displayName ?? v.name;
  const getAuthorLabel = (v: Version) =>
    v.authorName?.trim() || effectiveSettings.authorName?.trim() || "Unknown";

  return (
    <TooltipProvider>
      <div className="relative flex flex-col h-screen app-root">
        {shouldShowMainView && (
          <>
            <Header currentSlide={currentSlide} />

            <TabBar currentTab={currentTab} onTabChange={switchTab} />

            {/* ── History ─────────────────────────────────────────── */}
            {currentTab === "history" && (
              <HistoryPanel
                versions={versions}
                settings={effectiveSettings}
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
            {(currentTab === "diff" || hasActiveDiffComparison) && (
              <div className={currentTab === "diff" ? "flex-1 min-h-0" : "hidden"}>
                <DiffPanel
                  versions={versions}
                  currentSlide={currentSlide}
                  preselectedId={diffPreselectedId}
                  getVersionName={getVersionName}
                  getVersionBlob={getVersionBlob}
                  buildComparisonSlide={buildComparisonSlide}
                  analyzeSlideDiff={analyzeSlideDiff}
                  blobToBase64={blobToBase64}
                  replacePresentationFromBase64={replacePresentationFromBase64}
                  restoreVersionById={restoreVersion}
                  formatTimestamp={formatTimestamp}
                  getAuthorLabel={getAuthorLabel}
                  showStatus={showStatus}
                  onComparisonActiveChange={setHasActiveDiffComparison}
                />
              </div>
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
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
              </button>
            </footer>
          </>
        )}

        {shouldShowBootLoading && (
          <GitHubWelcomeGate
            phase="loading"
            onConnectGitHub={handleStartGitHubConnect}
            onContinueWithoutGitHub={handleContinueWithoutGitHub}
          />
        )}

        {/* ── Settings overlay ─────────────────────────────────── */}
        {settingsOpen && (
          <SettingsPageBoundary>
            <SettingsPage
              settings={effectiveSettings}
              onSettingsChange={onSettingsChangeForDocument}
              onClose={() => setSettingsOpen(false)}
              calculateStorageUsage={calculateStorageUsage}
              formatBytes={formatBytes}
              onExportZip={onExportZip}
              showStatus={showStatus}
              onVersionsReload={() => loadVersions().then(() => undefined)}
              enforceMaxVersions={enforceMaxVersions}
            />
          </SettingsPageBoundary>
        )}

        {shouldShowGitHubGate && onboardingStep === "welcome" && (
          <GitHubWelcomeGate
            phase="welcome"
            onConnectGitHub={handleStartGitHubConnect}
            onContinueWithoutGitHub={handleContinueWithoutGitHub}
          />
        )}

        {shouldShowGitHubGate && onboardingStep === "connect" && (
          <GitHubOnboardingGate
            initialConfig={activeGitHubSync}
            accountConnected={effectiveSettings.githubAccountConnected ?? false}
            onSkip={handleGitHubGateSkip}
            onConnected={handleGitHubGateConnected}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
