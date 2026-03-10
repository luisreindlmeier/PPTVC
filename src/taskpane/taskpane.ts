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

// ── In-memory state ───────────────────────────────────────────
// Names and tags are UI-only for now — backend persistence coming soon.

const pendingTags: PresetTag[] = [];
const versionNameOverrides = new Map<string, string>();
const versionTagsMap = new Map<string, PresetTag[]>();

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
    chip.addEventListener("click", () => {
      const idx = pendingTags.indexOf(tag);
      if (idx === -1) {
        pendingTags.push(tag);
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
    const versions = await listVersions();
    updateVersionCount(versions.length);

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

function updateVersionCount(count: number): void {
  const title = getEl<HTMLHeadingElement>("versions-title");
  const span = title.querySelector<HTMLSpanElement>(".pptvc-list-count");
  if (span) {
    span.textContent = `(${count})`;
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
  deleteBtn.addEventListener("click", () => showDeletePopup(version.id, li));

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

// ── Per-item tags (predefined picker) ────────────────────────

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

  // Show "+ tag" only if there are still unselected predefined tags
  const used = versionTagsMap.get(id) ?? [];
  const available = PREDEFINED_TAGS.filter((t) => !used.includes(t));
  if (available.length === 0) return;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "pptvc-version-tag-add";
  addBtn.textContent = "+ tag";
  addBtn.addEventListener("click", () => showVersionTagPicker(id, container, addBtn));
  container.appendChild(addBtn);
}

function showVersionTagPicker(
  id: string,
  container: HTMLDivElement,
  addBtn: HTMLButtonElement
): void {
  hide(addBtn);

  const picker = document.createElement("div");
  picker.className = "pptvc-version-tag-picker";

  const used = versionTagsMap.get(id) ?? [];
  const available = PREDEFINED_TAGS.filter((t) => !used.includes(t));

  for (const tag of available) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pptvc-tag-option";
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      const current = versionTagsMap.get(id) ?? [];
      current.push(tag);
      versionTagsMap.set(id, current);
      renderVersionTags(id, container);
    });
    picker.appendChild(chip);
  }

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "pptvc-version-tag-picker-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close tag picker");
  closeBtn.addEventListener("click", () => renderVersionTags(id, container));
  picker.appendChild(closeBtn);

  container.appendChild(picker);
}

// ── Delete popup ──────────────────────────────────────────────

function showDeletePopup(id: string, li: HTMLLIElement): void {
  // Toggle: if popup already open, close it
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
