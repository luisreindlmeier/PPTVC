/* global document, Office, PowerPoint, Blob, btoa, setTimeout, HTMLElement, HTMLDivElement, HTMLUListElement, HTMLParagraphElement, HTMLLIElement, HTMLButtonElement, HTMLSpanElement, HTMLInputElement, HTMLHeadingElement */

import {
  saveVersion,
  listVersions,
  restoreVersion,
  deleteVersion,
  updateVersionMeta,
  getVersionBlob,
  type Version,
} from "../versions";
import { buildComparisonSlide } from "../diff/build-comparison-slide";

// ── Constants ─────────────────────────────────────────────────

const PREDEFINED_TAGS = ["draft", "reviewed", "final", "sent", "archived", "important", "wip"];

const MAX_TAGS = 3;

const TAB_ORDER: Record<"history" | "diff" | "workflow", number> = {
  history: 0,
  diff: 1,
  workflow: 2,
};

// ── Heroicons (inline SVG, 24px viewBox outline) ──────────────

const ICON_DIFF = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" /></svg>`;
const ICON_TAG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.595.45a18.634 18.634 0 0 0 5.652-4.475 1.876 1.876 0 0 0-.45-2.594L10.455 3.659A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>`;
const ICON_VERSIONS = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`;
const ICON_RESTORE = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>`;
const ICON_CHECK = `<svg class="pptvc-slide-scope-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20,6 9,17 4,12"></polyline></svg>`;

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
let comparisonSlideId: string | null = null;

// ── Boot ──────────────────────────────────────────────────────

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    document.getElementById("sideload-msg")!.style.display = "none";
    document.getElementById("app-body")!.classList.remove("pptvc-hidden");

    document.getElementById("btn-save")!.addEventListener("click", () => {
      void onSaveClick();
    });
    document.getElementById("tab-history")!.addEventListener("click", () => {
      switchScope("history");
    });
    document.getElementById("tab-diff")!.addEventListener("click", () => {
      switchScope("diff", undefined, true);
    });
    document.getElementById("tab-workflow")!.addEventListener("click", () => {
      switchScope("workflow");
    });

    const slideScopeBtn = getEl<HTMLButtonElement>("btn-slide-scope");
    const slideScopePanel = getEl<HTMLDivElement>("slide-scope-panel");
    const closeSlideScopeDropdown = (): void => {
      slideScopePanel.classList.remove("pptvc-slide-scope-panel--open");
      slideScopeBtn.classList.remove("pptvc-slide-scope-btn--open");
      slideScopeBtn.setAttribute("aria-expanded", "false");
    };

    slideScopeBtn.addEventListener("click", () => {
      const isOpen = slideScopePanel.classList.contains("pptvc-slide-scope-panel--open");
      slideScopeBtn.setAttribute("aria-expanded", String(!isOpen));
      slideScopePanel.classList.toggle("pptvc-slide-scope-panel--open", !isOpen);
      slideScopeBtn.classList.toggle("pptvc-slide-scope-btn--open", !isOpen);
    });

    document.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const scopeWrapper = target.closest(".pptvc-slide-scope");
      if (!scopeWrapper) {
        closeSlideScopeDropdown();
      }

      const insideDeletePopup = target.closest(".pptvc-delete-popup");
      const onDeleteTrigger = target.closest(".pptvc-delete-trigger");
      if (!insideDeletePopup && !onDeleteTrigger) {
        closeAllDeletePopups();
      }

      const insideVersionTags = target.closest(".pptvc-version-tags");
      if (!insideVersionTags && expandedTagPickerVersionId !== null) {
        expandedTagPickerVersionId = null;
        rerenderAllVersionTagRows();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      closeSlideScopeDropdown();
      closeAllDeletePopups();
    });

    const tagDropdownBtn = getEl<HTMLButtonElement>("btn-tag-dropdown");
    const tagPanel = getEl<HTMLDivElement>("save-tags-panel");
    tagDropdownBtn.addEventListener("click", () => {
      const isOpen = !tagPanel.classList.contains("pptvc-hidden");
      tagDropdownBtn.setAttribute("aria-expanded", String(!isOpen));
      tagDropdownBtn.classList.toggle("pptvc-save-tag-dropdown--open", !isOpen);
      if (isOpen) {
        hide(tagPanel);
      } else {
        show(tagPanel);
      }
    });

    // Mark input as user-edited so auto-fill doesn't overwrite it
    const saveNameInput = getEl<HTMLInputElement>("version-name-input");
    saveNameInput.addEventListener("input", () => {
      saveNameInput.dataset["dirty"] = "1";
    });

    void initializeGlobalSlideScopePicker();
    renderSaveTagPicker();
    void loadVersionList();
    initSettings();
  }
});

// ── Utility ───────────────────────────────────────────────────

function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function hide(el: HTMLElement): void {
  el.classList.add("pptvc-hidden");
}

function show(el: HTMLElement): void {
  el.classList.remove("pptvc-hidden");
}

function showStatus(message: string, isError: boolean): void {
  const el = getEl<HTMLDivElement>("status-msg");
  el.textContent = message;
  el.className = `pptvc-status ${isError ? "pptvc-status--error" : "pptvc-status--success"}`;
  setTimeout(() => {
    el.textContent = "";
    el.className = "pptvc-status";
  }, 4000);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
            resolve({ index: 0, title: "" });
          }
        }
      );
    });
    slideNum = selected.index + 1;
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
          const newNum = slides[0].index + 1;
          if (availableSlides[0]?.num !== newNum) {
            availableSlides[0] = { num: newNum, name: `Slide ${newNum}` };
            globalSelectedSlides.clear();
            globalSelectedSlides.add(newNum);
            updateGlobalSlideScopeLabel();
          }
        }
      }
    );
  });
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

  for (const tag of PREDEFINED_TAGS) {
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
  versionTagContainers.clear();
  versionTagAddBtns.clear();
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
    nameInput.value = `Version ${count + 1}`;
  }
}

// ── Build version list item ───────────────────────────────────

function createVersionItem(version: Version): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "pptvc-version-item";
  li.dataset["versionId"] = version.id;

  // Timeline dot
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = `pptvc-version-dot${displayedVersionId === version.id ? " pptvc-version-dot--latest" : ""}`;
  dot.setAttribute("aria-label", `Select ${versionNameOverrides.get(version.id) ?? version.name}`);
  dot.addEventListener("click", () => {
    displayedVersionId = version.id;
    updateDisplayedVersionDot();
  });
  dot.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    displayedVersionId = version.id;
    updateDisplayedVersionDot();
  });
  li.appendChild(dot);

  // Header row: editable name + delete button
  const header = document.createElement("div");
  header.className = "pptvc-version-header";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "pptvc-version-name-input";
  nameInput.value = versionNameOverrides.get(version.id) ?? version.name;
  nameInput.setAttribute("aria-label", "Version name");
  nameInput.addEventListener("blur", () => {
    const newName = nameInput.value.trim();
    if (newName) {
      versionNameOverrides.set(version.id, newName);
      void updateVersionMeta(version.id, { displayName: newName });
    } else {
      nameInput.value = versionNameOverrides.get(version.id) ?? version.name;
    }
  });

  const headerActions = document.createElement("div");
  headerActions.className = "pptvc-version-header-actions";

  const viewDiffBtn = document.createElement("button");
  viewDiffBtn.type = "button";
  viewDiffBtn.className = "pptvc-btn-icon-action";
  viewDiffBtn.innerHTML = ICON_DIFF;
  viewDiffBtn.setAttribute("aria-label", "View diff");
  viewDiffBtn.title = "View diff";
  viewDiffBtn.addEventListener("click", () => {
    switchScope("diff", version.id);
  });

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "pptvc-btn-icon-action pptvc-btn-icon-action--restore";
  restoreBtn.innerHTML = ICON_RESTORE;
  restoreBtn.setAttribute("aria-label", "Restore this version");
  restoreBtn.title = "Restore this version";
  restoreBtn.addEventListener("click", () => {
    void onRestoreClick(version.id, restoreBtn);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "pptvc-btn-icon pptvc-delete-trigger";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", "Delete version");
  deleteBtn.addEventListener("click", () => showDeletePopup(version.id, li));

  headerActions.appendChild(viewDiffBtn);
  headerActions.appendChild(restoreBtn);
  headerActions.appendChild(deleteBtn);

  header.appendChild(nameInput);
  header.appendChild(headerActions);
  li.appendChild(header);

  // Meta row: timestamp + tags toggle
  const meta = document.createElement("div");
  meta.className = "pptvc-version-meta";

  const time = document.createElement("span");
  time.className = "pptvc-version-time";
  time.textContent = formatTimestamp(version.timestamp);
  meta.appendChild(time);

  const addTagBtn = document.createElement("button");
  addTagBtn.type = "button";
  addTagBtn.className = "pptvc-version-tag-add";
  addTagBtn.setAttribute("aria-expanded", "false");
  addTagBtn.innerHTML = `${ICON_TAG}<span>Tags</span>`;
  addTagBtn.addEventListener("click", () => {
    expandedTagPickerVersionId = expandedTagPickerVersionId === version.id ? null : version.id;
    rerenderAllVersionTagRows();
  });
  meta.appendChild(addTagBtn);
  versionTagAddBtns.set(version.id, addTagBtn);

  li.appendChild(meta);

  // Tags section — selected tags always visible below timestamp row.
  const tagsRow = document.createElement("div");
  tagsRow.className = "pptvc-version-tags";
  versionTagContainers.set(version.id, tagsRow);
  renderVersionTags(version.id, tagsRow);

  li.appendChild(tagsRow);

  return li;
}

// ── Per-item tags (predefined picker, max 3) ──────────────────

function renderVersionTags(id: string, container: HTMLDivElement): void {
  container.innerHTML = "";
  const tags = versionTagsMap.get(id) ?? [];

  // Sync inline add-button state
  const addBtn = versionTagAddBtns.get(id);
  if (addBtn) {
    const isOpen = expandedTagPickerVersionId === id;
    addBtn.setAttribute("aria-expanded", String(isOpen));
    addBtn.classList.toggle("pptvc-version-tag-add--open", isOpen);
  }

  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "pptvc-version-tag-chip";
    chip.textContent = tag;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "pptvc-version-tag-chip__remove";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove tag ${tag}`);
    removeBtn.addEventListener("click", () => {
      const current = versionTagsMap.get(id) ?? [];
      const newTags = current.filter((t) => t !== tag);
      versionTagsMap.set(id, newTags);
      void updateVersionMeta(id, { tags: newTags });
      if (newTags.length < MAX_TAGS && expandedTagPickerVersionId === null) {
        expandedTagPickerVersionId = id;
      }
      renderVersionTags(id, container);
    });

    chip.appendChild(removeBtn);
    container.appendChild(chip);
  }

  const used = versionTagsMap.get(id) ?? [];
  const available = PREDEFINED_TAGS.filter((t) => !used.includes(t));

  if (available.length > 0 && expandedTagPickerVersionId === id) {
    const options = document.createElement("div");
    options.className = "pptvc-version-tag-options";

    for (const tag of available) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "pptvc-tag-option";
      chip.textContent = tag;
      chip.addEventListener("click", () => {
        const current = versionTagsMap.get(id) ?? [];
        if (current.length < MAX_TAGS) {
          const newTags = [...current, tag];
          versionTagsMap.set(id, newTags);
          void updateVersionMeta(id, { tags: newTags });
          if (newTags.length >= MAX_TAGS) {
            expandedTagPickerVersionId = null;
          }
        }
        rerenderAllVersionTagRows();
      });
      options.appendChild(chip);
    }

    container.appendChild(options);
  }

  // Hide row when nothing to show (no chips, picker closed)
  if (container.children.length === 0) {
    container.classList.add("pptvc-hidden");
  } else {
    container.classList.remove("pptvc-hidden");
  }
}

function rerenderAllVersionTagRows(): void {
  for (const [id, container] of versionTagContainers) {
    renderVersionTags(id, container);
  }
}

// ── Delete popup ──────────────────────────────────────────────

function showDeletePopup(id: string, li: HTMLLIElement): void {
  closeAllDeletePopups();

  const existing = li.querySelector(".pptvc-delete-popup");
  if (existing) {
    existing.remove();
    return;
  }

  const popup = document.createElement("div");
  popup.className = "pptvc-delete-popup";

  const msg = document.createElement("p");
  msg.className = "pptvc-delete-popup__msg";
  msg.textContent = "Delete this version?";

  const actionsRow = document.createElement("div");
  actionsRow.className = "pptvc-delete-popup__actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "pptvc-btn pptvc-btn--ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => popup.remove());

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "pptvc-btn pptvc-btn--danger";
  confirmBtn.textContent = "Delete";
  confirmBtn.addEventListener("click", () => {
    popup.remove();
    confirmBtn.disabled = true;
    void onDeleteConfirm(id, li);
  });

  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(confirmBtn);
  popup.appendChild(msg);
  popup.appendChild(actionsRow);
  li.appendChild(popup);
}

function closeAllDeletePopups(): void {
  const popups = document.querySelectorAll<HTMLElement>(".pptvc-delete-popup");
  for (const popup of popups) {
    popup.remove();
  }
}

function isVersionNewerThanDisplayed(versionId: string): boolean {
  if (!displayedVersionId) {
    return false;
  }

  const displayedVersion = loadedVersions.find((version) => version.id === displayedVersionId);
  const version = loadedVersions.find((item) => item.id === versionId);
  if (!displayedVersion || !version) {
    return false;
  }

  return version.timestamp > displayedVersion.timestamp;
}

function updateDisplayedVersionDot(): void {
  const items = document.querySelectorAll<HTMLLIElement>(".pptvc-version-item");
  for (const item of items) {
    const dot = item.querySelector<HTMLButtonElement>(".pptvc-version-dot");
    if (!dot) {
      continue;
    }
    const versionId = item.dataset["versionId"];
    const isDisplayed = versionId === displayedVersionId;
    const isNewer = versionId ? isVersionNewerThanDisplayed(versionId) : false;
    dot.classList.toggle("pptvc-version-dot--latest", isDisplayed);
    item.classList.toggle("pptvc-version-item--newer", isNewer);
  }
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
  const container = getEl<HTMLDivElement>("diff-content");
  container.innerHTML = "";

  if (loadedVersions.length < 2) {
    const empty = document.createElement("p");
    empty.className = "pptvc-diff-empty";
    empty.textContent = "Save at least two versions to compare.";
    container.appendChild(empty);
    return;
  }

  // Comparing section
  const comparingTitle = document.createElement("h3");
  comparingTitle.className = "pptvc-section-title pptvc-diff-title";
  comparingTitle.textContent = "Comparing";
  container.appendChild(comparingTitle);

  const comparing = document.createElement("div");
  comparing.className = "pptvc-diff-comparing";

  const selectors = document.createElement("div");
  selectors.className = "pptvc-diff-selectors";

  const selectFrom = document.createElement("select");
  selectFrom.className = "pptvc-diff-select";
  selectFrom.setAttribute("aria-label", "From version");

  const selectTo = document.createElement("select");
  selectTo.className = "pptvc-diff-select";
  selectTo.setAttribute("aria-label", "To version");

  const makeSelectWrap = (select: HTMLElement): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.className = "pptvc-diff-select-wrap";

    const caret = document.createElement("span");
    caret.className = "pptvc-diff-select-caret";
    caret.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true"><path d="M0 0l5 6 5-6H0z"/></svg>';

    wrap.appendChild(select);
    wrap.appendChild(caret);
    return wrap;
  };

  for (const v of loadedVersions) {
    const label = `${versionNameOverrides.get(v.id) ?? v.name}`;

    const optFrom = document.createElement("option");
    optFrom.value = v.id;
    optFrom.textContent = label;
    selectFrom.appendChild(optFrom);

    const optTo = document.createElement("option");
    optTo.value = v.id;
    optTo.textContent = label;
    selectTo.appendChild(optTo);
  }

  // Pre-select: if a version was clicked, show it as "to"; compare with next version
  if (preselectedId) {
    const idx = loadedVersions.findIndex((v) => v.id === preselectedId);
    selectTo.value = preselectedId;
    // Select the version before it (older) as "from", or next if first
    const fromIdx = idx + 1 < loadedVersions.length ? idx + 1 : 0;
    selectFrom.value = loadedVersions[fromIdx].id;
  } else {
    selectFrom.value = loadedVersions[1].id;
    selectTo.value = loadedVersions[0].id;
  }

  const arrow = document.createElement("span");
  arrow.className = "pptvc-diff-arrow";
  arrow.textContent = "→";

  selectors.appendChild(makeSelectWrap(selectFrom));
  selectors.appendChild(arrow);
  selectors.appendChild(makeSelectWrap(selectTo));
  comparing.appendChild(selectors);

  const compareBtn = document.createElement("button");
  compareBtn.type = "button";
  compareBtn.className = "pptvc-btn pptvc-btn--primary";
  compareBtn.innerHTML =
    '<span class="btn-label">Compare Versions</span><span class="btn-spinner pptvc-hidden" aria-hidden="true"></span>';
  comparing.appendChild(compareBtn);

  container.appendChild(comparing);

  // ── Visual comparison status banner ──
  const comparisonBanner = document.createElement("div");
  comparisonBanner.className = "pptvc-diff-banner pptvc-hidden";

  const bannerText = document.createElement("span");
  bannerText.className = "pptvc-diff-banner-text";
  bannerText.textContent = "Comparison slide inserted below current slide";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "pptvc-diff-banner-clear";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", () => {
    void clearVisualComparison(comparisonBanner, compareBtn);
  });

  comparisonBanner.appendChild(bannerText);
  comparisonBanner.appendChild(clearBtn);
  container.appendChild(comparisonBanner);

  // ── Wire compare button ──
  compareBtn.addEventListener("click", () => {
    const fromVersion = loadedVersions.find((v) => v.id === selectFrom.value);
    const toVersion = loadedVersions.find((v) => v.id === selectTo.value);
    if (!fromVersion || !toVersion || fromVersion.id === toVersion.id) return;
    void runVisualComparison(fromVersion, toVersion, comparisonBanner, compareBtn);
  });
}

// ── Visual comparison (old shapes below current slide) ────────

async function runVisualComparison(
  fromVersion: Version,
  toVersion: Version,
  banner: HTMLDivElement,
  btn: HTMLButtonElement
): Promise<void> {
  const label = btn.querySelector<HTMLSpanElement>(".btn-label")!;
  const spinner = btn.querySelector<HTMLSpanElement>(".btn-spinner")!;

  btn.disabled = true;
  hide(label);
  show(spinner);
  hide(banner);

  try {
    const [toBlob, fromBlob] = await Promise.all([
      getVersionBlob(toVersion.snapshotPath),
      getVersionBlob(fromVersion.snapshotPath),
    ]);

    const slideIdx = (availableSlides[0]?.num ?? 1) - 1;
    const toName = versionNameOverrides.get(toVersion.id) ?? toVersion.name;
    const fromName = versionNameOverrides.get(fromVersion.id) ?? fromVersion.name;
    const modifiedBlob = await buildComparisonSlide(toBlob, fromBlob, slideIdx, toName, fromName);
    const base64 = await blobToBase64(modifiedBlob);

    // Replace the entire document (same pattern as restoreVersion)
    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides;
      slides.load("items/id");
      await context.sync();

      const existingIds = slides.items.map((s) => s.id);

      context.presentation.insertSlidesFromBase64(base64, {
        formatting: PowerPoint.InsertSlideFormatting.keepSourceFormatting,
      });
      await context.sync();

      for (const id of existingIds) {
        context.presentation.slides.getItem(id).delete();
      }
      await context.sync();
    });

    comparisonSlideId = toVersion.id; // store so Clear can restore it

    banner.querySelector<HTMLSpanElement>(".pptvc-diff-banner-text")!.textContent =
      `Scroll down on the slide to see "${fromName}" below "${toName}"`;
    show(banner);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to build comparison.", true);
  } finally {
    btn.disabled = false;
    show(label);
    hide(spinner);
  }
}

async function clearVisualComparison(
  banner: HTMLDivElement,
  btn: HTMLButtonElement
): Promise<void> {
  if (!comparisonSlideId) return;
  btn.disabled = true;

  try {
    await restoreVersion(comparisonSlideId);
    comparisonSlideId = null;
    hide(banner);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to clear comparison.", true);
  } finally {
    btn.disabled = false;
  }
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
    const version = await saveVersion({
      name: customName || undefined,
      tags: pendingTags.length > 0 ? [...pendingTags] : [],
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
    await loadVersionList();
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to save version.", true);
  } finally {
    btn.disabled = false;
    show(label);
    hide(spinner);
  }
}

// ── Restore ───────────────────────────────────────────────────

// ── Settings ───────────────────────────────────────────────────

function initSettings(): void {
  const settingsPage = getEl<HTMLDivElement>("settings-page");
  const btnOpen = getEl<HTMLButtonElement>("btn-settings");
  const btnBack = getEl<HTMLButtonElement>("btn-settings-back");

  btnOpen.addEventListener("click", () => show(settingsPage));
  btnBack.addEventListener("click", () => hide(settingsPage));
}

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
