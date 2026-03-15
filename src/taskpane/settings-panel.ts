/* global document, Blob, HTMLDivElement, HTMLButtonElement, HTMLInputElement, HTMLSpanElement */

import type { UserSettings } from "../storage";
import { formatBytes, getEl, hide, show, type SettingsTab } from "../ui";

export interface SettingsPanelDeps {
  calculateStorageUsage: () => Promise<number>;
  exportVersionsZip: () => Promise<Blob>;
  triggerDownload: (blob: Blob, filename: string) => void;
  showStatus: (message: string, isError: boolean) => void;
  renderSaveTagPicker: () => void;
  rerenderAllVersionTagRows: () => void;
  loadVersionList: () => Promise<void>;
  enforceMaxVersions: () => Promise<void>;
  switchSettingsTab: (tab: SettingsTab) => void;
  readUserSettings: () => Promise<UserSettings>;
  writeUserSettings: (settings: UserSettings) => Promise<void>;
  mergeSettings: (stored: UserSettings) => UserSettings;
  getUserSettings: () => UserSettings;
  setUserSettings: (next: UserSettings) => void;
  defaultNamingTemplate: string;
}

export function initSettingsPanel(deps: SettingsPanelDeps): void {
  const settingsPage = getEl<HTMLDivElement>("settings-page");
  const btnOpen = getEl<HTMLButtonElement>("btn-settings");
  const btnBack = getEl<HTMLButtonElement>("btn-settings-back");
  const nameInput = getEl<HTMLInputElement>("settings-name");
  const emailInput = getEl<HTMLInputElement>("settings-email");
  const autoSaveToggle = getEl<HTMLInputElement>("settings-autosave");
  const limitEnabledToggle = getEl<HTMLInputElement>("settings-limit-enabled");
  const maxVersionsInput = getEl<HTMLInputElement>("settings-max-versions");
  const nameTemplateInput = getEl<HTMLInputElement>("settings-name-template");
  const tagInput = getEl<HTMLInputElement>("settings-tag-input");
  const tagAddBtn = getEl<HTMLButtonElement>("btn-settings-tag-add");
  const tagList = getEl<HTMLDivElement>("settings-tag-list");
  const storageUsedEl = getEl<HTMLSpanElement>("settings-storage-used");
  const exportBtn = getEl<HTMLButtonElement>("btn-settings-export");
  const settingsTabs = document.querySelectorAll<HTMLButtonElement>(".pptvc-settings-tab");

  const refreshStorageUsage = async (): Promise<void> => {
    storageUsedEl.textContent = "Calculating...";
    try {
      const bytes = await deps.calculateStorageUsage();
      storageUsedEl.textContent = `${formatBytes(bytes)} used`;
    } catch {
      storageUsedEl.textContent = "Unable to calculate";
    }
  };

  const renderTagList = (): void => {
    tagList.innerHTML = "";
    const tags = deps.getUserSettings().customTags ?? [];

    for (const tag of tags) {
      const chip = document.createElement("span");
      chip.className = "pptvc-settings-tag-chip";
      chip.textContent = tag;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", `Remove tag ${tag}`);
      removeBtn.textContent = "x";
      removeBtn.addEventListener("click", () => {
        const current = deps.getUserSettings();
        const nextSettings: UserSettings = {
          ...current,
          customTags: (current.customTags ?? []).filter((t) => t !== tag),
        };
        deps.setUserSettings(nextSettings);
        void deps.writeUserSettings(nextSettings);
        renderTagList();
        deps.renderSaveTagPicker();
        deps.rerenderAllVersionTagRows();
      });

      chip.appendChild(removeBtn);
      tagList.appendChild(chip);
    }
  };

  const persistSettings = (): void => {
    const current = deps.getUserSettings();
    const isLimitEnabled = limitEnabledToggle.checked;
    const maxValue = Number.parseInt(maxVersionsInput.value, 10);
    const maxVersions =
      isLimitEnabled && Number.isFinite(maxValue) && maxValue > 0 ? maxValue : undefined;

    maxVersionsInput.disabled = !isLimitEnabled;

    const nextSettings: UserSettings = {
      ...current,
      authorName: nameInput.value.trim(),
      email: emailInput.value.trim(),
      autoSaveOnDocumentSave: autoSaveToggle.checked,
      maxVersions,
      namingTemplate: nameTemplateInput.value.trim() || deps.defaultNamingTemplate,
    };

    deps.setUserSettings(nextSettings);
    void deps.writeUserSettings(nextSettings);
    deps.renderSaveTagPicker();
    deps.rerenderAllVersionTagRows();
    void deps.loadVersionList();

    if (nextSettings.maxVersions) {
      void deps.enforceMaxVersions().then(deps.loadVersionList);
    }
  };

  void (async () => {
    try {
      const stored = await deps.readUserSettings();
      const merged = deps.mergeSettings(stored);
      deps.setUserSettings(merged);

      nameInput.value = merged.authorName ?? "";
      emailInput.value = merged.email ?? "";
      autoSaveToggle.checked = merged.autoSaveOnDocumentSave ?? false;
      limitEnabledToggle.checked = merged.maxVersions !== undefined;
      maxVersionsInput.value = merged.maxVersions?.toString() ?? "";
      maxVersionsInput.disabled = !limitEnabledToggle.checked;
      nameTemplateInput.value = merged.namingTemplate ?? deps.defaultNamingTemplate;
      renderTagList();
    } catch {
      // Non-blocking: settings fall back to default values.
    }
  })();

  nameInput.addEventListener("change", persistSettings);
  nameInput.addEventListener("blur", persistSettings);
  emailInput.addEventListener("change", persistSettings);
  emailInput.addEventListener("blur", persistSettings);
  autoSaveToggle.addEventListener("change", persistSettings);
  limitEnabledToggle.addEventListener("change", persistSettings);
  maxVersionsInput.addEventListener("change", persistSettings);
  nameTemplateInput.addEventListener("change", persistSettings);

  tagAddBtn.addEventListener("click", () => {
    const nextTag = tagInput.value.trim();
    if (!nextTag) {
      return;
    }

    const current = deps.getUserSettings();
    const nextSet = new Set(current.customTags ?? []);
    nextSet.add(nextTag);

    const nextSettings: UserSettings = {
      ...current,
      customTags: Array.from(nextSet),
    };

    deps.setUserSettings(nextSettings);
    tagInput.value = "";
    void deps.writeUserSettings(nextSettings);
    renderTagList();
    deps.renderSaveTagPicker();
    deps.rerenderAllVersionTagRows();
  });

  tagInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    tagAddBtn.click();
  });

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = "Preparing...";

    try {
      const zipBlob = await deps.exportVersionsZip();
      const stamp = new Date().toISOString().slice(0, 10);
      deps.triggerDownload(zipBlob, `pptvc-backup-${stamp}.zip`);
    } catch (err) {
      deps.showStatus(err instanceof Error ? err.message : "Failed to export backup.", true);
    } finally {
      exportBtn.textContent = "Download ZIP";
      exportBtn.disabled = false;
    }
  });

  settingsTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.settingsTab as SettingsTab | undefined;
      if (!target) {
        return;
      }

      deps.switchSettingsTab(target);
      if (target === "storage") {
        void refreshStorageUsage();
      }
    });
  });

  deps.switchSettingsTab("general");
  void refreshStorageUsage();

  btnOpen.addEventListener("click", () => show(settingsPage));
  btnBack.addEventListener("click", () => hide(settingsPage));
}
