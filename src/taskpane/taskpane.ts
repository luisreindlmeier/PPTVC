/* global document, Office, PowerPoint, Blob, btoa, URL, HTMLElement, HTMLDivElement, HTMLUListElement, HTMLParagraphElement, HTMLLIElement, HTMLButtonElement, HTMLSpanElement, HTMLInputElement, HTMLHeadingElement */

import {
  saveVersion,
  listVersions,
  restoreVersion,
  deleteVersion,
  updateVersionMeta,
  getVersionBlob,
  exportVersionsZip,
  type Version,
} from "../versions";
import { buildComparisonSlide } from "../diff/build-comparison-slide";
import {
  createStorageAdapter,
  readUserSettings,
  writeUserSettings,
  type UserSettings,
  type GitHubSyncConfig,
} from "../storage";
import {
  testGitHubConnection,
  pushVersionsToGitHub,
  getAppInstallUrl,
  findInstallation,
  testGedonusCommit,
} from "../sync/github-sync";
import {
  ICON_CHECK,
  ICON_VERSIONS,
  MAX_TAGS,
  SETTINGS_TAB_ORDER,
  TAB_ORDER,
  getEl,
  hide,
  show,
  showStatus,
  type SettingsTab,
} from "../ui";
import {
  DEFAULT_SETTINGS,
  getAvailableTags,
  getDefaultVersionName,
  mergeSettings,
} from "./settings-model";
import { initSettingsPanel } from "./settings-panel";
import { initializeTaskpaneApp } from "./bootstrap";
import { createHistoryPanel } from "./history-panel";
import { createDiffPanel } from "./diff-panel";

// ── Constants ─────────────────────────────────────────────────

type SlideInfo = { num: number; name: string };

// Populated at runtime from the active PowerPoint presentation
const availableSlides: SlideInfo[] = [];

// ── In-memory state ───────────────────────────────────────────
// Names and tags are UI-only for now — backend persistence coming soon.

const pendingTags: string[] = [];
const versionNameOverrides = new Map<string, string>();
const versionTagsMap = new Map<string, string[]>();
const versionTagContainers = new Map<string, HTMLDivElement>();
const versionTagAddBtns = new Map<string, HTMLButtonElement>();
let loadedVersions: Version[] = [];
const globalSelectedSlides = new Set<number>();
let displayedVersionId: string | null = null;
let expandedTagPickerVersionId: string | null = null;
let autoSaveInProgress = false;

let userSettings: UserSettings = { ...DEFAULT_SETTINGS };

const historyPanel = createHistoryPanel({
  getDisplayedVersionId: () => displayedVersionId,
  setDisplayedVersionId: (id) => {
    displayedVersionId = id;
  },
  getExpandedTagPickerVersionId: () => expandedTagPickerVersionId,
  setExpandedTagPickerVersionId: (id) => {
    expandedTagPickerVersionId = id;
  },
  getLoadedVersions: () => loadedVersions,
  getUserSettings: () => userSettings,
  getAuthorLabel,
  getVersionNameOverrides: () => versionNameOverrides,
  getVersionTagsMap: () => versionTagsMap,
  getVersionTagContainers: () => versionTagContainers,
  getVersionTagAddButtons: () => versionTagAddBtns,
  updateVersionMeta,
  onRestoreClick,
  onDeleteConfirm,
  switchScope,
});

const diffPanel = createDiffPanel({
  getLoadedVersions: () => loadedVersions,
  getVersionName: (version) => versionNameOverrides.get(version.id) ?? version.name,
  getCurrentSlideNum: () => availableSlides[0]?.num ?? 1,
  getVersionBlob,
  buildComparisonSlide,
  blobToBase64,
  replacePresentationFromBase64: async (base64: string) => {
    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides;
      slides.load("items/id");
      await context.sync();

      const existingIds = slides.items.map((slide) => slide.id);

      context.presentation.insertSlidesFromBase64(base64, {
        formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting,
      });
      await context.sync();

      for (const id of existingIds) {
        context.presentation.slides.getItem(id).delete();
      }
      await context.sync();
    });
  },
  restoreVersionById: async (id: string) => {
    await restoreVersion(id);
  },
  formatTimestamp: (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  },
  getAuthorLabel,
  showStatus,
});

// ── Boot ──────────────────────────────────────────────────────

initializeTaskpaneApp({
  onSaveClick,
  switchScope,
  initializeGlobalSlideScopePicker,
  renderSaveTagPicker,
  loadVersionList,
  initSettings,
  registerAutoSaveHandler,
  closeAllDeletePopups,
  rerenderAllVersionTagRows,
  getExpandedTagPickerVersionId: () => expandedTagPickerVersionId,
  setExpandedTagPickerVersionId: (value) => {
    expandedTagPickerVersionId = value;
  },
});

// ── Utility ───────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function calculateStorageUsage(): Promise<number> {
  const storage = createStorageAdapter();
  const versions = await listVersions();
  let total = 0;

  for (const version of versions) {
    const snapshot = await getVersionBlob(version.snapshotPath);
    total += snapshot.size;

    try {
      const metadataBlob = await storage.readBlob(version.metadataPath);
      total += metadataBlob.size;
    } catch {
      // Ignore missing metadata files
    }
  }

  return total;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getAuthorLabel(version: Version): string {
  const versionAuthor = version.authorName?.trim();
  const fallbackAuthor = userSettings.authorName?.trim() ?? "";
  return versionAuthor || fallbackAuthor || "Unknown";
}


function registerAutoSaveHandler(): void {
  Office.context.document.addHandlerAsync(
    Office.EventType.DocumentBeforeSave,
    (eventArgs: Office.DocumentBeforeSaveEventArgs) => {
      if (!userSettings.autoSaveOnDocumentSave || autoSaveInProgress) {
        eventArgs.completed();
        return;
      }

      autoSaveInProgress = true;
      void (async () => {
        try {
          const nextIndex = loadedVersions.length + 1;
          const defaultName = getDefaultVersionName(nextIndex, userSettings);
          await saveVersion({
            name: defaultName,
            tags: [],
            authorName: userSettings.authorName || undefined,
            authorEmail: userSettings.email || undefined,
          });
          await enforceMaxVersions();
          await loadVersionList();
          showStatus(`Auto-saved: ${defaultName}`, false);
        } catch (err) {
          showStatus(err instanceof Error ? err.message : "Auto-save failed.", true);
        } finally {
          autoSaveInProgress = false;
          eventArgs.completed();
        }
      })();
    }
  );
}

function switchSettingsTab(tab: SettingsTab): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".pptvc-settings-tab");
  tabs.forEach((btn) => {
    const isActive = btn.dataset.settingsTab === tab;
    btn.classList.toggle("pptvc-settings-tab--active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  const panels = document.querySelectorAll<HTMLElement>(".pptvc-settings-panel");
  panels.forEach((panel) => {
    const isActive = panel.dataset.settingsPanel === tab;
    panel.classList.toggle("pptvc-hidden", !isActive);
  });

  const indicator = getEl<HTMLDivElement>("settings-tab-indicator");
  indicator.style.transform = `translateX(${SETTINGS_TAB_ORDER[tab] * 100}%)`;
}

// ── Helpers ───────────────────────────────────────────────────

async function initializeGlobalSlideScopePicker(): Promise<void> {
  availableSlides.length = 0;
  globalSelectedSlides.clear();

  let slideNum = 1;

  try {
    // Get the currently selected slide via the Office document API
    const selected = await new Promise<{ index: number; title: string }>((resolve) => {
      Office.context.document.getSelectedDataAsync(
        Office.CoercionType.SlideRange,
        (result: Office.AsyncResult<{ slides?: { index: number; title: string }[] }>) => {
          const slides = result.value?.slides;
          if (result.status === Office.AsyncResultStatus.Succeeded && slides?.length) {
            resolve(slides[0]);
          } else {
            resolve({ index: 1, title: "" });
          }
        }
      );
    });
    // SlideRange index is already 1-based in PowerPoint.
    slideNum = Math.max(1, selected.index);
  } catch {
    // Fallback: default to slide 1
  }

  availableSlides.push({ num: slideNum, name: `Slide ${slideNum}` });
  globalSelectedSlides.add(slideNum);

  // Disable the picker — tool currently focuses on the active slide only
  const scopeBtn = getEl<HTMLButtonElement>("btn-slide-scope");
  scopeBtn.disabled = true;

  renderGlobalSlideScopeOptions();
  updateGlobalSlideScopeLabel();

  // Keep label in sync whenever the user navigates to a different slide
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => {
    Office.context.document.getSelectedDataAsync(
      Office.CoercionType.SlideRange,
      (result: Office.AsyncResult<{ slides?: { index: number; title: string }[] }>) => {
        const slides = result.value?.slides;
        if (result.status === Office.AsyncResultStatus.Succeeded && slides?.length) {
          const newNum = Math.max(1, slides[0].index);
          if (availableSlides[0]?.num !== newNum) {
            availableSlides[0] = { num: newNum, name: `Slide ${newNum}` };
            globalSelectedSlides.clear();
            globalSelectedSlides.add(newNum);
            updateGlobalSlideScopeLabel();
            syncDiffBannerToSlide(newNum);
          }
        }
      }
    );
  });
}

function syncDiffBannerToSlide(slideNum: number): void {
  diffPanel.syncBannerToSlide(slideNum);
}

function isGlobalPresentationSelected(): boolean {
  return globalSelectedSlides.size >= availableSlides.length;
}

function updateGlobalSlideScopeLabel(): void {
  const labelEl = getEl<HTMLSpanElement>("slide-scope-label");
  if (availableSlides.length === 1) {
    labelEl.textContent = `Slide ${availableSlides[0].num}`;
    return;
  }
  if (isGlobalPresentationSelected()) {
    labelEl.textContent = "Presentation";
    return;
  }
  labelEl.textContent = `${globalSelectedSlides.size} Slides`;
}

function renderGlobalSlideScopeOptions(): void {
  const options = getEl<HTMLDivElement>("slide-scope-options");
  options.innerHTML = "";

  for (const slide of availableSlides) {
    const isSelected = globalSelectedSlides.has(slide.num);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pptvc-slide-scope-option${isSelected ? " pptvc-slide-scope-option--selected" : ""}`;
    btn.innerHTML = `<span>Slide ${slide.num} - ${slide.name}</span>${ICON_CHECK}`;
    btn.addEventListener("click", () => {
      if (globalSelectedSlides.has(slide.num)) {
        globalSelectedSlides.delete(slide.num);
      } else {
        globalSelectedSlides.add(slide.num);
      }

      // Empty selection falls back to full presentation.
      if (globalSelectedSlides.size === 0) {
        for (const s of availableSlides) {
          globalSelectedSlides.add(s.num);
        }
      }

      renderGlobalSlideScopeOptions();
      updateGlobalSlideScopeLabel();

      const diffScope = getEl<HTMLDivElement>("diff-scope");
      if (!diffScope.classList.contains("pptvc-hidden")) {
        loadDiffScope();
      }
    });
    options.appendChild(btn);
  }
}

// ── Scope tabs ────────────────────────────────────────────────

// pptvc-hidden uses !important — must use classList, not style.display
function switchScope(
  scope: "history" | "diff" | "workflow",
  preselectedId?: string,
  loadIfEmpty = false
): void {
  const tabHistory = getEl<HTMLButtonElement>("tab-history");
  const tabDiff = getEl<HTMLButtonElement>("tab-diff");
  const tabWorkflow = getEl<HTMLButtonElement>("tab-workflow");
  const historyScope = getEl<HTMLDivElement>("history-scope");
  const diffScope = getEl<HTMLDivElement>("diff-scope");
  const workflowScope = getEl<HTMLDivElement>("workflow-scope");
  const isHistory = scope === "history";
  const isDiff = scope === "diff";
  const isWorkflow = scope === "workflow";

  tabHistory.classList.toggle("pptvc-scope-tab--active", isHistory);
  tabHistory.setAttribute("aria-selected", String(isHistory));
  tabDiff.classList.toggle("pptvc-scope-tab--active", isDiff);
  tabDiff.setAttribute("aria-selected", String(isDiff));
  tabWorkflow.classList.toggle("pptvc-scope-tab--active", isWorkflow);
  tabWorkflow.setAttribute("aria-selected", String(isWorkflow));

  // Slide indicator to active tab
  const indicator = getEl<HTMLDivElement>("scope-indicator");
  indicator.style.transform = `translateX(${TAB_ORDER[scope] * 100}%)`;

  // Brief bounce on the newly active tab
  const newTab = getEl<HTMLButtonElement>(`tab-${scope}`);
  newTab.classList.remove("pptvc-scope-tab--bounce");
  void newTab.offsetWidth; // force reflow to restart animation
  newTab.classList.add("pptvc-scope-tab--bounce");

  if (isHistory) {
    show(historyScope);
    hide(diffScope);
    hide(workflowScope);
  } else if (isDiff) {
    hide(historyScope);
    show(diffScope);
    hide(workflowScope);
    const diffContent = getEl<HTMLDivElement>("diff-content");
    // Populate when called from "View diff" (always) or tab click when empty
    if (preselectedId !== undefined || loadIfEmpty || !diffContent.hasChildNodes()) {
      loadDiffScope(preselectedId);
    }
  } else {
    hide(historyScope);
    hide(diffScope);
    show(workflowScope);
  }
}

// ── Save form: predefined tag picker ─────────────────────────

function renderSaveTagPicker(): void {
  const container = getEl<HTMLDivElement>("save-tag-picker");
  container.innerHTML = "";

  for (const tag of getAvailableTags(userSettings)) {
    const selected = pendingTags.includes(tag);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `pptvc-tag-option${selected ? " pptvc-tag-option--selected" : ""}`;
    chip.textContent = tag;

    // Disable unselected tags when max is reached
    if (!selected && pendingTags.length >= MAX_TAGS) {
      chip.disabled = true;
    }

    chip.addEventListener("click", () => {
      const idx = pendingTags.indexOf(tag);
      if (idx === -1) {
        if (pendingTags.length < MAX_TAGS) {
          pendingTags.push(tag);
        }
      } else {
        pendingTags.splice(idx, 1);
      }
      renderSaveTagPicker();
    });
    container.appendChild(chip);
  }
}

// ── Load version list ─────────────────────────────────────────

async function loadVersionList(): Promise<void> {
  const loadingEl = getEl<HTMLDivElement>("versions-loading");
  const listEl = getEl<HTMLUListElement>("versions-list");
  const emptyEl = getEl<HTMLParagraphElement>("versions-empty");

  show(loadingEl);
  listEl.innerHTML = "";
  historyPanel.clearRowCaches();
  hide(emptyEl);

  try {
    loadedVersions = await listVersions();

    if (loadedVersions.length === 0) {
      displayedVersionId = null;
      expandedTagPickerVersionId = null;
    } else if (
      displayedVersionId === null ||
      !loadedVersions.some((version) => version.id === displayedVersionId)
    ) {
      // Fallback to newest when no displayed version exists yet.
      displayedVersionId = loadedVersions[0].id;
    }

    // Sync in-memory state from persisted metadata
    versionNameOverrides.clear();
    versionTagsMap.clear();
    for (const v of loadedVersions) {
      if (v.displayName) versionNameOverrides.set(v.id, v.displayName);
      if (v.tags && v.tags.length > 0) versionTagsMap.set(v.id, v.tags);
    }

    updateVersionCount(loadedVersions.length);

    if (loadedVersions.length === 0) {
      show(emptyEl);
    } else {
      for (const version of loadedVersions) {
        listEl.appendChild(createVersionItem(version));
      }
    }
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to load versions.", true);
  } finally {
    hide(loadingEl);
  }
}

function updateVersionCount(count: number): void {
  const title = getEl<HTMLHeadingElement>("versions-title");
  const span = title.querySelector<HTMLSpanElement>(".pptvc-list-count");
  if (span) {
    const label = count === 1 ? "Version Saved" : "Versions Saved";
    span.innerHTML = `${ICON_VERSIONS}<span>${count} ${label}</span>`;
  }
  // Pre-fill next version name in save input (only if user hasn't typed)
  const nameInput = getEl<HTMLInputElement>("version-name-input");
  if (!nameInput.dataset["dirty"]) {
    nameInput.value = getDefaultVersionName(count + 1, userSettings);
  }
}

async function enforceMaxVersions(): Promise<void> {
  const max = userSettings.maxVersions;
  if (!max || max <= 0) {
    return;
  }

  const versions = await listVersions();
  if (versions.length <= max) {
    return;
  }

  const excess = versions.slice(max);
  for (const version of excess) {
    await deleteVersion(version.id);
  }
}

// ── Build version list item ───────────────────────────────────

function createVersionItem(version: Version): HTMLLIElement {
  return historyPanel.createVersionItem(version);
}

// ── Per-item tags (predefined picker, max 3) ──────────────────

function rerenderAllVersionTagRows(): void {
  historyPanel.rerenderAllVersionTagRows();
}

// ── Delete popup ──────────────────────────────────────────────

function closeAllDeletePopups(): void {
  historyPanel.closeAllDeletePopups();
}

function updateDisplayedVersionDot(): void {
  historyPanel.updateDisplayedVersionDot();
}

// ── Delete confirm ────────────────────────────────────────────

async function onDeleteConfirm(id: string, li: HTMLLIElement): Promise<void> {
  try {
    await deleteVersion(id);
    li.remove();
    loadedVersions = loadedVersions.filter((v) => v.id !== id);
    versionNameOverrides.delete(id);
    versionTagsMap.delete(id);
    if (displayedVersionId === id) {
      displayedVersionId = loadedVersions[0]?.id ?? null;
      updateDisplayedVersionDot();
    }
    updateVersionCount(loadedVersions.length);
    const listEl = getEl<HTMLUListElement>("versions-list");
    if (listEl.children.length === 0) {
      show(getEl<HTMLParagraphElement>("versions-empty"));
    }
    showStatus("Version deleted.", false);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to delete version.", true);
  }
}

// ── Diff scope ────────────────────────────────────────────────

function loadDiffScope(preselectedId?: string): void {
  diffPanel.loadDiffScope(preselectedId);
}

// ── Save ──────────────────────────────────────────────────────

async function onSaveClick(): Promise<void> {
  const btn = getEl<HTMLButtonElement>("btn-save");
  const label = btn.querySelector<HTMLSpanElement>(".btn-label")!;
  const spinner = btn.querySelector<HTMLSpanElement>(".btn-spinner")!;
  const nameInput = getEl<HTMLInputElement>("version-name-input");
  const customName = nameInput.value.trim();

  btn.disabled = true;
  hide(label);
  show(spinner);

  try {
    const nextIndex = loadedVersions.length + 1;
    const defaultName = getDefaultVersionName(nextIndex, userSettings);
    const version = await saveVersion({
      name: customName || defaultName,
      tags: pendingTags.length > 0 ? [...pendingTags] : [],
      authorName: userSettings.authorName || undefined,
      authorEmail: userSettings.email || undefined,
    });

    displayedVersionId = version.id;

    if (customName) {
      versionNameOverrides.set(version.id, customName);
    }
    if (pendingTags.length > 0) {
      versionTagsMap.set(version.id, [...pendingTags]);
    }

    showStatus(`Saved: ${customName || version.name}`, false);
    nameInput.value = "";
    nameInput.dataset["dirty"] = "";
    delete nameInput.dataset["dirty"];
    pendingTags.splice(0, pendingTags.length);
    // Close tag dropdown panel after save
    const tagDropdownBtn = getEl<HTMLButtonElement>("btn-tag-dropdown");
    const tagPanel = getEl<HTMLDivElement>("save-tags-panel");
    tagDropdownBtn.setAttribute("aria-expanded", "false");
    tagDropdownBtn.classList.remove("pptvc-save-tag-dropdown--open");
    hide(tagPanel);
    renderSaveTagPicker();
    await enforceMaxVersions();
    await loadVersionList();
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to save version.", true);
  } finally {
    btn.disabled = false;
    show(label);
    hide(spinner);
  }
}

// ── Settings ───────────────────────────────────────────────────

function initSettings(): void {
  initSettingsPanel({
    calculateStorageUsage,
    exportVersionsZip,
    triggerDownload,
    showStatus,
    renderSaveTagPicker,
    rerenderAllVersionTagRows,
    loadVersionList,
    enforceMaxVersions,
    switchSettingsTab,
    readUserSettings,
    writeUserSettings,
    mergeSettings,
    getUserSettings: () => userSettings,
    setUserSettings: (next) => {
      userSettings = next;
    },
    defaultNamingTemplate: DEFAULT_SETTINGS.namingTemplate ?? "Version {version_number}",
  });
  initGitHubSync();
}

// ── GitHub Sync ────────────────────────────────────────────────

function initGitHubSync(): void {
  const repoInput = getEl<HTMLInputElement>("settings-github-repo");
  const branchInput = getEl<HTMLInputElement>("settings-github-branch");
  const testBtn = getEl<HTMLButtonElement>("btn-github-test");
  const syncBtn = getEl<HTMLButtonElement>("btn-github-sync");
  const statusEl = getEl<HTMLDivElement>("github-sync-status");
  const disconnectedRow = getEl<HTMLDivElement>("gedonus-disconnected");
  const connectedRow = getEl<HTMLDivElement>("gedonus-connected");
  const connectBtn = getEl<HTMLButtonElement>("btn-gedonus-connect");
  const confirmBtn = getEl<HTMLButtonElement>("btn-gedonus-confirm");
  const disconnectBtn = getEl<HTMLButtonElement>("btn-gedonus-disconnect");
  const testCommitBtn = getEl<HTMLButtonElement>("btn-gedonus-test-commit");

  // installationId is stored in userSettings.githubSync — kept in sync via persistSyncConfig
  let storedInstallationId: number | undefined;

  const getSyncConfig = (): GitHubSyncConfig => {
    const cfg: GitHubSyncConfig = {
      repo: repoInput.value.trim(),
      branch: branchInput.value.trim() || "main",
    };
    if (storedInstallationId !== undefined) cfg.installationId = storedInstallationId;
    return cfg;
  };

  const showSyncStatus = (message: string, isError: boolean): void => {
    statusEl.textContent = message;
    statusEl.className = `pptvc-sync-status pptvc-sync-status--${isError ? "error" : "ok"}`;
    show(statusEl);
  };

  const persistSyncConfig = (): void => {
    const config = getSyncConfig();
    if (config.repo) {
      userSettings.githubSync = config;
    } else {
      delete userSettings.githubSync;
    }
    void writeUserSettings(userSettings);
  };

  // ── Gedonus connection state ────────────────────────────────

  const setGedonusState = (state: "disconnected" | "connected"): void => {
    if (state === "connected") {
      hide(disconnectedRow);
      show(connectedRow);
    } else {
      show(disconnectedRow);
      hide(connectedRow);
    }
  };

  // Shared: look up installation for current repo and connect
  const verifyAndConnect = async (): Promise<void> => {
    const repo = repoInput.value.trim();
    if (!repo) {
      showSyncStatus("Enter a repository first.", true);
      return;
    }
    const id = await findInstallation(repo);
    if (id === null) {
      showSyncStatus("App not found on this repo. Install it via 'Connect Gedonus' first.", true);
      return;
    }
    storedInstallationId = id;
    persistSyncConfig();
    setGedonusState("connected");
    showSyncStatus("Gedonus connected. Commits will appear under the Gedonus account.", false);
  };

  // Connect button: open GitHub App install page
  connectBtn.addEventListener("click", () => {
    if (!repoInput.value.trim()) {
      showSyncStatus("Enter a repository first.", true);
      return;
    }
    connectBtn.disabled = true;
    void (async () => {
      try {
        const url = await getAppInstallUrl();
        if (!url) {
          showSyncStatus("Could not reach Gedonus service. Try again later.", true);
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      } finally {
        connectBtn.disabled = false;
      }
    })();
  });

  // Confirm button: verify install happened (also works if already installed)
  confirmBtn.addEventListener("click", () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Checking…";
    void verifyAndConnect().finally(() => {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "I've installed it";
    });
  });

  // Disconnect: clear installationId
  disconnectBtn.addEventListener("click", () => {
    storedInstallationId = undefined;
    persistSyncConfig();
    setGedonusState("disconnected");
    hide(statusEl);
  });

  // ── Load saved config ───────────────────────────────────────

  void (async () => {
    try {
      const stored = await readUserSettings();
      const cfg = stored.githubSync;
      if (cfg) {
        repoInput.value = cfg.repo;
        branchInput.value = cfg.branch !== "main" ? cfg.branch : "";
        storedInstallationId = cfg.installationId;
      }
    } catch {
      // Non-blocking
    }
    // Show Gedonus section once settings are loaded
    setGedonusState(storedInstallationId !== undefined ? "connected" : "disconnected");
  })();

  repoInput.addEventListener("blur", persistSyncConfig);
  branchInput.addEventListener("blur", persistSyncConfig);

  // ── Test Gedonus Commit ─────────────────────────────────────

  testCommitBtn.addEventListener("click", () => {
    const config = getSyncConfig();
    testCommitBtn.textContent = "Committing…";
    testCommitBtn.setAttribute("disabled", "");
    void (async () => {
      try {
        await testGedonusCommit(config);
        showSyncStatus(
          "Test commit created. Check your repo — Gedonus should appear as committer.",
          false
        );
      } catch (err) {
        showSyncStatus(err instanceof Error ? err.message : "Test commit failed.", true);
      } finally {
        testCommitBtn.textContent = "Test commit";
        testCommitBtn.removeAttribute("disabled");
      }
    })();
  });

  // ── Test Connection ─────────────────────────────────────────

  testBtn.addEventListener("click", () => {
    const config = getSyncConfig();
    if (!config.repo) {
      showSyncStatus("Enter a repository first.", true);
      return;
    }
    if (!config.installationId) {
      showSyncStatus("Connect Gedonus first.", true);
      return;
    }
    testBtn.disabled = true;
    testBtn.textContent = "Testing...";
    void (async () => {
      try {
        await testGitHubConnection(config);
        showSyncStatus(`Connected to ${config.repo}.`, false);
        persistSyncConfig();
      } catch (err) {
        showSyncStatus(err instanceof Error ? err.message : "Connection failed.", true);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = "Test Connection";
      }
    })();
  });

  // ── Sync ────────────────────────────────────────────────────

  syncBtn.addEventListener("click", () => {
    const config = getSyncConfig();
    if (!config.repo) {
      showSyncStatus("Enter a repository first.", true);
      return;
    }
    if (!config.installationId) {
      showSyncStatus("Connect Gedonus first.", true);
      return;
    }
    const label = syncBtn.querySelector<HTMLSpanElement>(".btn-label")!;
    const spinner = syncBtn.querySelector<HTMLSpanElement>(".btn-spinner")!;
    syncBtn.disabled = true;
    testBtn.disabled = true;
    hide(label);
    show(spinner);
    showSyncStatus("Starting sync...", false);
    void (async () => {
      try {
        const versions = await listVersions();
        if (versions.length === 0) {
          showSyncStatus("No versions to sync.", false);
          return;
        }
        const result = await pushVersionsToGitHub(config, versions, getVersionBlob, (progress) => {
          showSyncStatus(`${progress.label} (${progress.current}/${progress.total})`, false);
        });
        persistSyncConfig();
        if (result.errors.length === 0) {
          showSyncStatus(`Synced ${result.pushed} files to ${config.repo}.`, false);
        } else {
          showSyncStatus(
            `Synced ${result.pushed} files. ${result.errors.length} error(s): ${result.errors[0]}`,
            true
          );
        }
      } catch (err) {
        showSyncStatus(err instanceof Error ? err.message : "Sync failed.", true);
      } finally {
        syncBtn.disabled = false;
        testBtn.disabled = false;
        show(label);
        hide(spinner);
      }
    })();
  });



// ── Restore ───────────────────────────────────────────────────

async function onRestoreClick(id: string, btn: HTMLButtonElement): Promise<void> {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "";

  try {
    await restoreVersion(id);
    displayedVersionId = id;
    updateDisplayedVersionDot();
    showStatus("Restored successfully.", false);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to restore version.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}
