/* global document, Blob, HTMLDivElement, HTMLButtonElement, HTMLSpanElement, HTMLElement */

import type { Version } from "../versions";
import { hide, show } from "../ui";

interface SlideComparison {
  fromVersion: Version;
  toVersion: Version;
}

export interface DiffPanelDeps {
  getLoadedVersions: () => Version[];
  getVersionName: (version: Version) => string;
  getCurrentSlideNum: () => number;
  getVersionBlob: (snapshotPath: string) => Promise<Blob>;
  buildComparisonSlide: (
    toBlob: Blob,
    fromBlob: Blob,
    slideIndex: number,
    toName: string,
    fromName: string,
    toTimestamp: string,
    toAuthor: string
  ) => Promise<Blob>;
  blobToBase64: (blob: Blob) => Promise<string>;
  replacePresentationFromBase64: (base64: string) => Promise<void>;
  restoreVersionById: (id: string) => Promise<void>;
  formatTimestamp: (timestamp: number) => string;
  getAuthorLabel: (version: Version) => string;
  showStatus: (message: string, isError: boolean) => void;
}

export interface DiffPanelApi {
  loadDiffScope: (preselectedId?: string) => void;
  syncBannerToSlide: (slideNum: number) => void;
}

export function createDiffPanel(deps: DiffPanelDeps): DiffPanelApi {
  const activeComparisons = new Map<number, SlideComparison>();
  let currentDiffBanner: HTMLDivElement | null = null;
  let currentCompareBtn: HTMLButtonElement | null = null;

  async function runVisualComparison(
    fromVersion: Version,
    toVersion: Version,
    banner: HTMLDivElement,
    btn: HTMLButtonElement
  ): Promise<void> {
    const label = btn.querySelector<HTMLSpanElement>(".btn-label");
    const spinner = btn.querySelector<HTMLSpanElement>(".btn-spinner");
    if (!label || !spinner) {
      return;
    }

    btn.disabled = true;
    hide(label);
    show(spinner);
    hide(banner);

    try {
      const [toBlob, fromBlob] = await Promise.all([
        deps.getVersionBlob(toVersion.snapshotPath),
        deps.getVersionBlob(fromVersion.snapshotPath),
      ]);

      const slideNum = deps.getCurrentSlideNum();
      const slideIdx = slideNum - 1;
      const toName = deps.getVersionName(toVersion);
      const fromName = deps.getVersionName(fromVersion);
      const toTimestamp = deps.formatTimestamp(toVersion.timestamp);
      const toAuthor = deps.getAuthorLabel(toVersion);

      const modifiedBlob = await deps.buildComparisonSlide(
        toBlob,
        fromBlob,
        slideIdx,
        toName,
        fromName,
        toTimestamp,
        toAuthor
      );
      const base64 = await deps.blobToBase64(modifiedBlob);
      await deps.replacePresentationFromBase64(base64);

      activeComparisons.set(slideNum, { fromVersion, toVersion });
      const textEl = banner.querySelector<HTMLSpanElement>(".pptvc-diff-banner-text");
      if (textEl) {
        textEl.textContent = `Scroll down on the slide to see "${fromName}" below "${toName}"`;
      }
      show(banner);
    } catch (err) {
      deps.showStatus(err instanceof Error ? err.message : "Failed to build comparison.", true);
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
    const currentSlideNum = deps.getCurrentSlideNum();
    const comp = activeComparisons.get(currentSlideNum);
    if (!comp) {
      return;
    }

    btn.disabled = true;
    try {
      await deps.restoreVersionById(comp.toVersion.id);
      activeComparisons.delete(currentSlideNum);
      hide(banner);
    } catch (err) {
      deps.showStatus(err instanceof Error ? err.message : "Failed to clear comparison.", true);
    } finally {
      btn.disabled = false;
    }
  }

  function syncBannerToSlide(slideNum: number): void {
    if (!currentDiffBanner || !currentCompareBtn) {
      return;
    }

    const comp = activeComparisons.get(slideNum);
    if (!comp) {
      hide(currentDiffBanner);
      return;
    }

    const fromName = deps.getVersionName(comp.fromVersion);
    const toName = deps.getVersionName(comp.toVersion);
    const textEl = currentDiffBanner.querySelector<HTMLSpanElement>(".pptvc-diff-banner-text");
    if (textEl) {
      textEl.textContent = `Scroll down on the slide to see "${fromName}" below "${toName}"`;
    }
    show(currentDiffBanner);
  }

  function loadDiffScope(preselectedId?: string): void {
    const container = document.getElementById("diff-content") as HTMLDivElement | null;
    if (!container) {
      return;
    }
    container.innerHTML = "";

    const loadedVersions = deps.getLoadedVersions();
    if (loadedVersions.length < 2) {
      const empty = document.createElement("p");
      empty.className = "pptvc-diff-empty";
      empty.textContent = "Save at least two versions to compare.";
      container.appendChild(empty);
      return;
    }

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

    for (const version of loadedVersions) {
      const label = deps.getVersionName(version);

      const optFrom = document.createElement("option");
      optFrom.value = version.id;
      optFrom.textContent = label;
      selectFrom.appendChild(optFrom);

      const optTo = document.createElement("option");
      optTo.value = version.id;
      optTo.textContent = label;
      selectTo.appendChild(optTo);
    }

    if (preselectedId) {
      const idx = loadedVersions.findIndex((v) => v.id === preselectedId);
      selectTo.value = preselectedId;
      const fromIdx = idx + 1 < loadedVersions.length ? idx + 1 : 0;
      selectFrom.value = loadedVersions[fromIdx].id;
    } else {
      selectFrom.value = loadedVersions[1].id;
      selectTo.value = loadedVersions[0].id;
    }

    const arrow = document.createElement("span");
    arrow.className = "pptvc-diff-arrow";
    arrow.textContent = "->";

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

    const comparisonBanner = document.createElement("div");
    comparisonBanner.className = "pptvc-diff-banner pptvc-hidden";

    const bannerText = document.createElement("span");
    bannerText.className = "pptvc-diff-banner-text";
    bannerText.textContent = "Comparison active on this slide";

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

    currentDiffBanner = comparisonBanner;
    currentCompareBtn = compareBtn;

    syncBannerToSlide(deps.getCurrentSlideNum());

    compareBtn.addEventListener("click", () => {
      const fromVersion = loadedVersions.find((v) => v.id === selectFrom.value);
      const toVersion = loadedVersions.find((v) => v.id === selectTo.value);
      if (!fromVersion || !toVersion || fromVersion.id === toVersion.id) {
        return;
      }
      void runVisualComparison(fromVersion, toVersion, comparisonBanner, compareBtn);
    });
  }

  return {
    loadDiffScope,
    syncBannerToSlide,
  };
}
