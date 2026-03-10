/* global document, Office, setTimeout, HTMLElement, HTMLDivElement, HTMLUListElement, HTMLParagraphElement, HTMLLIElement, HTMLButtonElement, HTMLSpanElement, HTMLInputElement, KeyboardEvent */

import { saveVersion, listVersions, restoreVersion, type Version } from "../versions";

// ── In-memory state ───────────────────────────────────────────
// Names and tags are not yet persisted — backend support coming soon.

const pendingTags: string[] = [];
const versionNameOverrides = new Map<string, string>();
const versionTagsMap = new Map<string, string[]>();
const deleteConfirmSet = new Set<string>();

// ── Boot ──────────────────────────────────────────────────────

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    document.getElementById("sideload-msg")!.style.display = "none";
    document.getElementById("app-body")!.classList.remove("pptvc-hidden");

    document.getElementById("btn-save")!.addEventListener("click", () => {
      void onSaveClick();
    });
    document.getElementById("tab-presentation")!.addEventListener("click", () => {
      switchScope("presentation");
    });
    document.getElementById("tab-slide")!.addEventListener("click", () => {
      switchScope("slide");
    });

    initTagInput();
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

// ── Scope tabs ────────────────────────────────────────────────

function switchScope(scope: "presentation" | "slide"): void {
  const tabPresentation = getEl<HTMLButtonElement>("tab-presentation");
  const tabSlide = getEl<HTMLButtonElement>("tab-slide");
  const presentationScope = getEl<HTMLDivElement>("presentation-scope");
  const slidePlaceholder = getEl<HTMLDivElement>("slide-placeholder");

  const isPresentation = scope === "presentation";

  tabPresentation.classList.toggle("pptvc-scope-tab--active", isPresentation);
  tabPresentation.setAttribute("aria-selected", String(isPresentation));
  tabSlide.classList.toggle("pptvc-scope-tab--active", !isPresentation);
  tabSlide.setAttribute("aria-selected", String(!isPresentation));

  if (isPresentation) {
    show(presentationScope);
    hide(slidePlaceholder);
  } else {
    hide(presentationScope);
    show(slidePlaceholder);
  }
}

// ── Save form: tag input ──────────────────────────────────────

function initTagInput(): void {
  const input = getEl<HTMLInputElement>("tag-input");

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = input.value.trim().replace(/,$/, "");
      if (value) {
        addPendingTag(value);
        input.value = "";
      }
    }
    if (e.key === "Backspace" && input.value === "" && pendingTags.length > 0) {
      removePendingTag(pendingTags.length - 1);
    }
  });
}

function addPendingTag(tag: string): void {
  if (pendingTags.includes(tag)) return;
  pendingTags.push(tag);
  renderPendingTags();
}

function removePendingTag(index: number): void {
  pendingTags.splice(index, 1);
  renderPendingTags();
}

function renderPendingTags(): void {
  const container = getEl<HTMLDivElement>("pending-tags-list");
  container.innerHTML = "";
  pendingTags.forEach((tag, index) => {
    container.appendChild(makePendingTagChip(tag, index));
  });
}

function makePendingTagChip(tag: string, index: number): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = "pptvc-tag-chip";
  chip.textContent = tag;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "pptvc-tag-chip__remove";
  removeBtn.textContent = "×";
  removeBtn.setAttribute("aria-label", `Remove tag ${tag}`);
  removeBtn.addEventListener("click", () => removePendingTag(index));

  chip.appendChild(removeBtn);
  return chip;
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
    const versions = await listVersions();
    if (versions.length === 0) {
      show(emptyEl);
    } else {
      for (const version of versions) {
        listEl.appendChild(createVersionItem(version, versions));
      }
    }
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to load versions.", true);
  } finally {
    hide(loadingEl);
  }
}

// ── Build version list item ───────────────────────────────────

function createVersionItem(version: Version, allVersions: Version[]): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "pptvc-version-item";

  // Top row: editable name + delete button
  const top = document.createElement("div");
  top.className = "pptvc-version-top";

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

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "pptvc-btn-icon";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", "Delete version");
  deleteBtn.addEventListener("click", () => onDeleteClick(version.id, deleteBtn));

  top.appendChild(nameInput);
  top.appendChild(deleteBtn);
  li.appendChild(top);

  // Timestamp
  const time = document.createElement("span");
  time.className = "pptvc-version-time";
  time.textContent = formatTimestamp(version.timestamp);
  li.appendChild(time);

  // Tags row
  const tagsRow = document.createElement("div");
  tagsRow.className = "pptvc-version-tags";
  renderVersionTags(version.id, tagsRow);
  li.appendChild(tagsRow);

  // Actions row
  const actions = document.createElement("div");
  actions.className = "pptvc-version-actions";

  const diffBtn = document.createElement("button");
  diffBtn.type = "button";
  diffBtn.className = "pptvc-btn pptvc-btn--ghost";
  diffBtn.textContent = "Diff ▾";

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "pptvc-btn pptvc-btn--restore";
  restoreBtn.textContent = "Restore";
  restoreBtn.addEventListener("click", () => {
    void onRestoreClick(version.id, restoreBtn);
  });

  actions.appendChild(diffBtn);
  actions.appendChild(restoreBtn);
  li.appendChild(actions);

  // Diff panel (hidden until toggled)
  const diffPanel = document.createElement("div");
  diffPanel.className = "pptvc-diff-panel pptvc-hidden";
  buildDiffPanel(diffPanel, version.id, allVersions);
  li.appendChild(diffPanel);

  diffBtn.addEventListener("click", () => {
    const isOpen = !diffPanel.classList.contains("pptvc-hidden");
    if (isOpen) {
      hide(diffPanel);
      diffBtn.textContent = "Diff ▾";
    } else {
      show(diffPanel);
      diffBtn.textContent = "Diff ▴";
    }
  });

  return li;
}

// ── Per-item tags ─────────────────────────────────────────────

function renderVersionTags(id: string, container: HTMLDivElement): void {
  container.innerHTML = "";
  const tags = versionTagsMap.get(id) ?? [];

  tags.forEach((tag, index) => {
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
      current.splice(index, 1);
      versionTagsMap.set(id, current);
      renderVersionTags(id, container);
    });

    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "pptvc-version-tag-add";
  addBtn.textContent = "+ tag";
  addBtn.addEventListener("click", () => showInlineTagInput(id, container, addBtn));
  container.appendChild(addBtn);
}

function showInlineTagInput(
  id: string,
  container: HTMLDivElement,
  addBtn: HTMLButtonElement
): void {
  hide(addBtn);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "pptvc-version-tag-input";
  input.placeholder = "tag name…";
  input.maxLength = 30;
  container.appendChild(input);
  input.focus();

  const commit = (): void => {
    const value = input.value.trim();
    if (value) {
      const current = versionTagsMap.get(id) ?? [];
      if (!current.includes(value)) {
        current.push(value);
        versionTagsMap.set(id, current);
      }
    }
    renderVersionTags(id, container);
  };

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      renderVersionTags(id, container);
    }
  });
  input.addEventListener("blur", commit);
}

// ── Diff panel ────────────────────────────────────────────────

function buildDiffPanel(panel: HTMLDivElement, currentId: string, allVersions: Version[]): void {
  const others = allVersions.filter((v) => v.id !== currentId);

  const label = document.createElement("span");
  label.className = "pptvc-diff-label";
  label.textContent = "Compare with";
  panel.appendChild(label);

  if (others.length === 0) {
    const note = document.createElement("p");
    note.className = "pptvc-diff-engine-note";
    note.textContent = "Save at least two versions to compare.";
    panel.appendChild(note);
    return;
  }

  const select = document.createElement("select");
  select.className = "pptvc-diff-select";
  select.setAttribute("aria-label", "Version to compare against");
  for (const v of others) {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${versionNameOverrides.get(v.id) ?? v.name} — ${formatTimestamp(v.timestamp)}`;
    select.appendChild(opt);
  }
  panel.appendChild(select);

  // Placeholder diff visualization (will be replaced by real diff engine)
  const placeholder = document.createElement("div");
  placeholder.className = "pptvc-diff-placeholder";

  placeholder.appendChild(buildDiffCol("Before", false));
  placeholder.appendChild(buildDiffCol("After", true));
  panel.appendChild(placeholder);

  const note = document.createElement("p");
  note.className = "pptvc-diff-engine-note";
  note.textContent = "Diff engine coming soon — slide changes will appear here.";
  panel.appendChild(note);
}

function buildDiffCol(labelText: string, markChanged: boolean): HTMLDivElement {
  const col = document.createElement("div");
  col.className = "pptvc-diff-col";

  const colLabel = document.createElement("span");
  colLabel.className = "pptvc-diff-col__label";
  colLabel.textContent = labelText;
  col.appendChild(colLabel);
  col.appendChild(makeDiffSlide(markChanged));
  col.appendChild(makeDiffSlide(false));

  return col;
}

function makeDiffSlide(changed: boolean): HTMLDivElement {
  const slide = document.createElement("div");
  slide.className = "pptvc-diff-slide";

  const bar1 = document.createElement("div");
  bar1.className = `pptvc-diff-slide__bar${changed ? " pptvc-diff-slide__bar--changed" : ""}`;

  const bar2 = document.createElement("div");
  bar2.className = `pptvc-diff-slide__bar pptvc-diff-slide__bar--short${changed ? " pptvc-diff-slide__bar--changed" : ""}`;

  slide.appendChild(bar1);
  slide.appendChild(bar2);
  return slide;
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
    pendingTags.splice(0, pendingTags.length);
    renderPendingTags();
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
  const originalText = btn.textContent ?? "Restore";
  btn.disabled = true;
  btn.textContent = "Restoring…";

  try {
    await restoreVersion(id);
    showStatus("Restored successfully.", false);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to restore version.", true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ── Delete (two-step confirm) ─────────────────────────────────

function onDeleteClick(id: string, btn: HTMLButtonElement): void {
  if (deleteConfirmSet.has(id)) {
    deleteConfirmSet.delete(id);
    // Stub: real delete wired once deleteVersion() exists in src/versions/
    showStatus("Delete not yet implemented — coming soon.", false);
    btn.textContent = "✕";
    btn.classList.remove("pptvc-btn-icon--confirm");
    return;
  }

  deleteConfirmSet.add(id);
  btn.textContent = "Sure?";
  btn.classList.add("pptvc-btn-icon--confirm");

  // Auto-cancel after 3 s if no second click
  setTimeout(() => {
    if (deleteConfirmSet.has(id)) {
      deleteConfirmSet.delete(id);
      btn.textContent = "✕";
      btn.classList.remove("pptvc-btn-icon--confirm");
    }
  }, 3000);
}
