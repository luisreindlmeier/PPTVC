/* global document, Office, setTimeout, HTMLElement, HTMLDivElement, HTMLUListElement, HTMLParagraphElement, HTMLLIElement, HTMLButtonElement, HTMLSpanElement, HTMLInputElement, HTMLHeadingElement */

import { saveVersion, listVersions, restoreVersion, type Version } from "../versions";

// ── Constants ─────────────────────────────────────────────────

const PREDEFINED_TAGS = [
  "draft",
  "reviewed",
  "final",
  "sent",
  "archived",
  "important",
  "wip",
] as const;
type PresetTag = (typeof PREDEFINED_TAGS)[number];

const MAX_TAGS = 3;

// ── Heroicons (inline SVG, 24px viewBox outline) ──────────────

const ICON_DIFF = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" /></svg>`;
const ICON_VERSIONS = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>`;
const ICON_RESTORE = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>`;
const ICON_TAG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.595.45a18.634 18.634 0 0 0 5.652-4.475 1.876 1.876 0 0 0-.45-2.594L10.455 3.659A2.25 2.25 0 0 0 9.568 3Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>`;

// ── In-memory state ───────────────────────────────────────────
// Names and tags are UI-only for now — backend persistence coming soon.

const pendingTags: PresetTag[] = [];
const versionNameOverrides = new Map<string, string>();
const versionTagsMap = new Map<string, PresetTag[]>();
let loadedVersions: Version[] = [];

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

    renderSaveTagPicker();
    void loadVersionList();
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

function setTagsToggleLabel(btn: HTMLButtonElement, count: number): void {
  const label = count > 0 ? `Tags (${count})` : `Tags`;
  btn.innerHTML = `${ICON_TAG}<span>${label}</span>`;
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
  hide(emptyEl);

  try {
    loadedVersions = await listVersions();
    updateVersionCount(loadedVersions.length);

    if (loadedVersions.length === 0) {
      show(emptyEl);
    } else {
      for (const version of loadedVersions) {
        listEl.appendChild(createVersionItem(version, loadedVersions));
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

function createVersionItem(version: Version, allVersions: Version[]): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "pptvc-version-item";

  // Timeline dot
  const dot = document.createElement("div");
  dot.className = `pptvc-version-dot${allVersions[0].id === version.id ? " pptvc-version-dot--latest" : ""}`;
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
  deleteBtn.className = "pptvc-btn-icon";
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

  const tagsToggle = document.createElement("button");
  tagsToggle.type = "button";
  tagsToggle.className = "pptvc-tags-toggle";
  const existingTags = versionTagsMap.get(version.id) ?? [];
  setTagsToggleLabel(tagsToggle, existingTags.length);
  meta.appendChild(tagsToggle);

  li.appendChild(meta);

  // Tags section — hidden by default, toggled by button
  const tagsRow = document.createElement("div");
  tagsRow.className = "pptvc-version-tags pptvc-hidden";
  renderVersionTags(version.id, tagsRow);

  tagsToggle.addEventListener("click", () => {
    const isOpen = !tagsRow.classList.contains("pptvc-hidden");
    if (isOpen) {
      hide(tagsRow);
      const current = versionTagsMap.get(version.id) ?? [];
      setTagsToggleLabel(tagsToggle, current.length);
    } else {
      renderVersionTags(version.id, tagsRow);
      show(tagsRow);
      setTagsToggleLabel(tagsToggle, (versionTagsMap.get(version.id) ?? []).length);
    }
  });

  li.appendChild(tagsRow);

  return li;
}

// ── Per-item tags (predefined picker, max 3) ──────────────────

function renderVersionTags(id: string, container: HTMLDivElement): void {
  container.innerHTML = "";
  const tags = versionTagsMap.get(id) ?? [];

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
      versionTagsMap.set(
        id,
        current.filter((t) => t !== tag)
      );
      renderVersionTags(id, container);
    });

    chip.appendChild(removeBtn);
    container.appendChild(chip);
  }

  // Directly show available tags as selectable chips (no intermediate add button)
  const used = versionTagsMap.get(id) ?? [];
  if (used.length >= MAX_TAGS) return;
  const available = PREDEFINED_TAGS.filter((t) => !used.includes(t));
  if (available.length === 0) return;

  for (const tag of available) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pptvc-tag-option";
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      const current = versionTagsMap.get(id) ?? [];
      if (current.length < MAX_TAGS) {
        versionTagsMap.set(id, [...current, tag]);
      }
      renderVersionTags(id, container);
      const li = container.closest<HTMLLIElement>(".pptvc-version-item");
      const toggle = li?.querySelector<HTMLButtonElement>(".pptvc-tags-toggle");
      if (toggle) setTagsToggleLabel(toggle, versionTagsMap.get(id)?.length ?? 0);
    });
    container.appendChild(chip);
  }
}

// ── Delete popup ──────────────────────────────────────────────

function showDeletePopup(id: string, li: HTMLLIElement): void {
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
    // Stub — deleteVersion() backend coming soon
    showStatus("Delete not yet implemented — coming soon.", false);
  });

  actionsRow.appendChild(cancelBtn);
  actionsRow.appendChild(confirmBtn);
  popup.appendChild(msg);
  popup.appendChild(actionsRow);
  li.appendChild(popup);
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

  // COMPARING section
  const comparing = document.createElement("div");
  comparing.className = "pptvc-diff-comparing";

  const sectionLabel = document.createElement("span");
  sectionLabel.className = "pptvc-diff-section-label";
  sectionLabel.textContent = "Comparing";
  comparing.appendChild(sectionLabel);

  const selectors = document.createElement("div");
  selectors.className = "pptvc-diff-selectors";

  const selectFrom = document.createElement("select");
  selectFrom.className = "pptvc-diff-select";
  selectFrom.setAttribute("aria-label", "From version");

  const selectTo = document.createElement("select");
  selectTo.className = "pptvc-diff-select";
  selectTo.setAttribute("aria-label", "To version");

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

  selectors.appendChild(selectFrom);
  selectors.appendChild(arrow);
  selectors.appendChild(selectTo);
  comparing.appendChild(selectors);
  container.appendChild(comparing);

  // Summary badges
  const summary = document.createElement("div");
  summary.className = "pptvc-diff-summary";

  const badgeChanges = document.createElement("span");
  badgeChanges.className = "pptvc-diff-badge pptvc-diff-badge--changes";
  badgeChanges.textContent = "— changes";

  const badgeSlides = document.createElement("span");
  badgeSlides.className = "pptvc-diff-badge";
  badgeSlides.textContent = "— slides";

  summary.appendChild(badgeChanges);
  summary.appendChild(badgeSlides);
  container.appendChild(summary);

  // CHANGED SLIDES section
  const slidesSection = document.createElement("div");
  slidesSection.className = "pptvc-diff-slides-section";

  const slidesHeader = document.createElement("div");
  slidesHeader.className = "pptvc-diff-slides-header";

  const slidesLabel = document.createElement("span");
  slidesLabel.className = "pptvc-diff-section-label";
  slidesLabel.style.marginBottom = "0";
  slidesLabel.textContent = "Changed Slides";
  slidesHeader.appendChild(slidesLabel);
  slidesSection.appendChild(slidesHeader);

  const slideList = document.createElement("ul");
  slideList.className = "pptvc-diff-slide-list";

  // Placeholder slides — diff engine not yet implemented
  const placeholderSlides = [
    { num: 1, name: "Title Slide" },
    { num: 3, name: "Overview" },
  ];

  for (const slide of placeholderSlides) {
    const item = document.createElement("li");
    item.className = "pptvc-diff-slide-item";

    const row = document.createElement("div");
    row.className = "pptvc-diff-slide-row";

    const numBox = document.createElement("div");
    numBox.className = "pptvc-diff-slide-number";
    numBox.textContent = String(slide.num);

    const name = document.createElement("span");
    name.className = "pptvc-diff-slide-name";
    name.textContent = slide.name;

    const dot = document.createElement("div");
    dot.className = "pptvc-diff-slide-indicator";

    row.appendChild(numBox);
    row.appendChild(name);
    row.appendChild(dot);
    item.appendChild(row);

    // Placeholder shape changes
    const changeList = document.createElement("div");
    changeList.className = "pptvc-diff-change-list";

    const changeData = [
      { name: "Title text box", delta: "modified" },
      { name: "Body text", delta: "modified" },
    ];
    for (const change of changeData) {
      const changeItem = document.createElement("div");
      changeItem.className = "pptvc-diff-change-item";

      const changeName = document.createElement("span");
      changeName.className = "pptvc-diff-change-name";
      changeName.textContent = change.name;

      const changeDelta = document.createElement("span");
      changeDelta.className = "pptvc-diff-change-delta";
      changeDelta.textContent = change.delta;

      changeItem.appendChild(changeName);
      changeItem.appendChild(changeDelta);
      changeList.appendChild(changeItem);
    }
    item.appendChild(changeList);
    slideList.appendChild(item);
  }

  slidesSection.appendChild(slideList);
  container.appendChild(slidesSection);

  const note = document.createElement("p");
  note.className = "pptvc-diff-placeholder-note";
  note.textContent = "Diff engine coming soon — actual changes will appear here.";
  container.appendChild(note);
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
    const version = await saveVersion();

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

async function onRestoreClick(id: string, btn: HTMLButtonElement): Promise<void> {
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "";

  try {
    await restoreVersion(id);
    showStatus("Restored successfully.", false);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to restore version.", true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}
