/* global document, HTMLDivElement, HTMLButtonElement, HTMLLIElement */

import type { Version } from "../versions";
import type { UserSettings } from "../storage";
import { ICON_DIFF, ICON_RESTORE, ICON_TAG, MAX_TAGS, formatTimestamp } from "../ui";
import { getAvailableTags } from "./settings-model";

export interface HistoryPanelDeps {
  getDisplayedVersionId: () => string | null;
  setDisplayedVersionId: (id: string | null) => void;
  getExpandedTagPickerVersionId: () => string | null;
  setExpandedTagPickerVersionId: (id: string | null) => void;
  getLoadedVersions: () => Version[];
  getUserSettings: () => UserSettings;
  getAuthorLabel: (version: Version) => string;
  getVersionNameOverrides: () => Map<string, string>;
  getVersionTagsMap: () => Map<string, string[]>;
  getVersionTagContainers: () => Map<string, HTMLDivElement>;
  getVersionTagAddButtons: () => Map<string, HTMLButtonElement>;
  updateVersionMeta: (
    id: string,
    options: { displayName?: string; tags?: string[] }
  ) => Promise<void>;
  onRestoreClick: (id: string, btn: HTMLButtonElement) => Promise<void>;
  onDeleteConfirm: (id: string, li: HTMLLIElement) => Promise<void>;
  switchScope: (scope: "history" | "diff" | "workflow", preselectedId?: string) => void;
}

export interface HistoryPanelApi {
  createVersionItem: (version: Version) => HTMLLIElement;
  rerenderAllVersionTagRows: () => void;
  closeAllDeletePopups: () => void;
  updateDisplayedVersionDot: () => void;
  clearRowCaches: () => void;
}

export function createHistoryPanel(deps: HistoryPanelDeps): HistoryPanelApi {
  function renderVersionTags(id: string, container: HTMLDivElement): void {
    container.innerHTML = "";

    const tagsMap = deps.getVersionTagsMap();
    const tags = tagsMap.get(id) ?? [];

    const addBtn = deps.getVersionTagAddButtons().get(id);
    if (addBtn) {
      const isOpen = deps.getExpandedTagPickerVersionId() === id;
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
      removeBtn.textContent = "x";
      removeBtn.setAttribute("aria-label", `Remove tag ${tag}`);
      removeBtn.addEventListener("click", () => {
        const current = tagsMap.get(id) ?? [];
        const newTags = current.filter((t) => t !== tag);
        tagsMap.set(id, newTags);
        void deps.updateVersionMeta(id, { tags: newTags });

        if (newTags.length < MAX_TAGS && deps.getExpandedTagPickerVersionId() === null) {
          deps.setExpandedTagPickerVersionId(id);
        }

        renderVersionTags(id, container);
      });

      chip.appendChild(removeBtn);
      container.appendChild(chip);
    }

    const available = getAvailableTags(deps.getUserSettings()).filter((t) => !tags.includes(t));
    if (available.length > 0 && deps.getExpandedTagPickerVersionId() === id) {
      const options = document.createElement("div");
      options.className = "pptvc-version-tag-options";

      for (const tag of available) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "pptvc-tag-option";
        chip.textContent = tag;
        chip.addEventListener("click", () => {
          const current = tagsMap.get(id) ?? [];
          if (current.length < MAX_TAGS) {
            const newTags = [...current, tag];
            tagsMap.set(id, newTags);
            void deps.updateVersionMeta(id, { tags: newTags });
            if (newTags.length >= MAX_TAGS) {
              deps.setExpandedTagPickerVersionId(null);
            }
          }
          rerenderAllVersionTagRows();
        });
        options.appendChild(chip);
      }

      container.appendChild(options);
    }

    if (container.children.length === 0) {
      container.classList.add("pptvc-hidden");
    } else {
      container.classList.remove("pptvc-hidden");
    }
  }

  function rerenderAllVersionTagRows(): void {
    deps.getVersionTagContainers().forEach((container, id) => {
      renderVersionTags(id, container);
    });
  }

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
      void deps.onDeleteConfirm(id, li);
    });

    actionsRow.appendChild(cancelBtn);
    actionsRow.appendChild(confirmBtn);
    popup.appendChild(msg);
    popup.appendChild(actionsRow);
    li.appendChild(popup);
  }

  function closeAllDeletePopups(): void {
    const popups = document.querySelectorAll(".pptvc-delete-popup");
    popups.forEach((popup) => {
      popup.remove();
    });
  }

  function isVersionNewerThanDisplayed(versionId: string): boolean {
    const displayedVersionId = deps.getDisplayedVersionId();
    if (!displayedVersionId) {
      return false;
    }

    const versions = deps.getLoadedVersions();
    const displayedVersion = versions.find((version) => version.id === displayedVersionId);
    const version = versions.find((item) => item.id === versionId);

    if (!displayedVersion || !version) {
      return false;
    }

    return version.timestamp > displayedVersion.timestamp;
  }

  function updateDisplayedVersionDot(): void {
    const items = document.querySelectorAll<HTMLLIElement>(".pptvc-version-item");
    items.forEach((item) => {
      const dot = item.querySelector(".pptvc-version-dot") as HTMLButtonElement | null;
      if (!dot) {
        return;
      }

      const versionId = item.dataset["versionId"];
      const isDisplayed = versionId === deps.getDisplayedVersionId();
      const isNewer = versionId ? isVersionNewerThanDisplayed(versionId) : false;
      dot.classList.toggle("pptvc-version-dot--latest", isDisplayed);
      item.classList.toggle("pptvc-version-item--newer", isNewer);
    });
  }

  function createVersionItem(version: Version): HTMLLIElement {
    const nameOverrides = deps.getVersionNameOverrides();
    const tagsMap = deps.getVersionTagsMap();

    const li = document.createElement("li");
    li.className = "pptvc-version-item";
    li.dataset["versionId"] = version.id;

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `pptvc-version-dot${
      deps.getDisplayedVersionId() === version.id ? " pptvc-version-dot--latest" : ""
    }`;
    dot.setAttribute("aria-label", `Select ${nameOverrides.get(version.id) ?? version.name}`);
    dot.addEventListener("click", () => {
      deps.setDisplayedVersionId(version.id);
      updateDisplayedVersionDot();
    });
    dot.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      deps.setDisplayedVersionId(version.id);
      updateDisplayedVersionDot();
    });
    li.appendChild(dot);

    const header = document.createElement("div");
    header.className = "pptvc-version-header";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "pptvc-version-name-input";
    nameInput.value = nameOverrides.get(version.id) ?? version.name;
    nameInput.setAttribute("aria-label", "Version name");
    nameInput.addEventListener("blur", () => {
      const newName = nameInput.value.trim();
      if (newName) {
        nameOverrides.set(version.id, newName);
        void deps.updateVersionMeta(version.id, { displayName: newName });
      } else {
        nameInput.value = nameOverrides.get(version.id) ?? version.name;
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
      deps.switchScope("diff", version.id);
    });

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "pptvc-btn-icon-action pptvc-btn-icon-action--restore";
    restoreBtn.innerHTML = ICON_RESTORE;
    restoreBtn.setAttribute("aria-label", "Restore this version");
    restoreBtn.title = "Restore this version";
    restoreBtn.addEventListener("click", () => {
      void deps.onRestoreClick(version.id, restoreBtn);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "pptvc-btn-icon pptvc-delete-trigger";
    deleteBtn.textContent = "x";
    deleteBtn.setAttribute("aria-label", "Delete version");
    deleteBtn.addEventListener("click", () => showDeletePopup(version.id, li));

    headerActions.appendChild(viewDiffBtn);
    headerActions.appendChild(restoreBtn);
    headerActions.appendChild(deleteBtn);

    header.appendChild(nameInput);
    header.appendChild(headerActions);
    li.appendChild(header);

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
      const next = deps.getExpandedTagPickerVersionId() === version.id ? null : version.id;
      deps.setExpandedTagPickerVersionId(next);
      rerenderAllVersionTagRows();
    });
    meta.appendChild(addTagBtn);
    deps.getVersionTagAddButtons().set(version.id, addTagBtn);

    li.appendChild(meta);

    const author = document.createElement("span");
    author.className = "pptvc-version-author";
    author.textContent = `Author: ${deps.getAuthorLabel(version)}`;
    li.appendChild(author);

    const tagsRow = document.createElement("div");
    tagsRow.className = "pptvc-version-tags";
    deps.getVersionTagContainers().set(version.id, tagsRow);

    if (version.tags && version.tags.length > 0) {
      tagsMap.set(version.id, version.tags);
    }

    renderVersionTags(version.id, tagsRow);
    li.appendChild(tagsRow);

    return li;
  }

  function clearRowCaches(): void {
    deps.getVersionTagContainers().clear();
    deps.getVersionTagAddButtons().clear();
  }

  return {
    createVersionItem,
    rerenderAllVersionTagRows,
    closeAllDeletePopups,
    updateDisplayedVersionDot,
    clearRowCaches,
  };
}
