/* global document, Office, HTMLElement, HTMLDivElement, HTMLButtonElement, HTMLInputElement */

import { getEl, hide, show } from "../ui";
import type { ScopeTab } from "../ui";

export interface BootstrapDeps {
  onSaveClick: () => Promise<void>;
  switchScope: (scope: ScopeTab, preselectedId?: string, preserveSelection?: boolean) => void;
  initializeGlobalSlideScopePicker: () => Promise<void>;
  renderSaveTagPicker: () => void;
  loadVersionList: () => Promise<void>;
  initSettings: () => void;
  registerAutoSaveHandler: () => void;
  closeAllDeletePopups: () => void;
  rerenderAllVersionTagRows: () => void;
  getExpandedTagPickerVersionId: () => string | null;
  setExpandedTagPickerVersionId: (value: string | null) => void;
}

export function initializeTaskpaneApp(deps: BootstrapDeps): void {
  Office.onReady((info) => {
    if (info.host !== Office.HostType.PowerPoint) {
      return;
    }

    document.getElementById("sideload-msg")!.style.display = "none";
    document.getElementById("app-body")!.classList.remove("pptvc-hidden");

    document.getElementById("btn-save")!.addEventListener("click", () => {
      void deps.onSaveClick();
    });

    document.getElementById("tab-history")!.addEventListener("click", () => {
      deps.switchScope("history");
    });

    document.getElementById("tab-diff")!.addEventListener("click", () => {
      deps.switchScope("diff", undefined, true);
    });

    document.getElementById("tab-workflow")!.addEventListener("click", () => {
      deps.switchScope("workflow");
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
        deps.closeAllDeletePopups();
      }

      const insideVersionTags = target.closest(".pptvc-version-tags");
      if (!insideVersionTags && deps.getExpandedTagPickerVersionId() !== null) {
        deps.setExpandedTagPickerVersionId(null);
        deps.rerenderAllVersionTagRows();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      closeSlideScopeDropdown();
      deps.closeAllDeletePopups();
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

    const saveNameInput = getEl<HTMLInputElement>("version-name-input");
    saveNameInput.addEventListener("input", () => {
      saveNameInput.dataset["dirty"] = "1";
    });

    void deps.initializeGlobalSlideScopePicker();
    deps.renderSaveTagPicker();
    void deps.loadVersionList();
    deps.initSettings();
    deps.registerAutoSaveHandler();
  });
}
