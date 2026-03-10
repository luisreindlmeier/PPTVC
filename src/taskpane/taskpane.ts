/* global document, Office, setTimeout, HTMLElement, HTMLDivElement, HTMLUListElement, HTMLParagraphElement, HTMLLIElement, HTMLButtonElement, HTMLSpanElement */

import { saveVersion, listVersions, restoreVersion, type Version } from "../versions";

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    document.getElementById("sideload-msg")!.style.display = "none";
    document.getElementById("app-body")!.style.display = "flex";
    document.getElementById("btn-save")!.addEventListener("click", () => {
      void onSaveClick();
    });
    void loadVersionList();
  }
});

function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
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

async function loadVersionList(): Promise<void> {
  const loadingEl = getEl<HTMLDivElement>("versions-loading");
  const listEl = getEl<HTMLUListElement>("versions-list");
  const emptyEl = getEl<HTMLParagraphElement>("versions-empty");

  loadingEl.style.display = "flex";
  listEl.innerHTML = "";
  emptyEl.style.display = "none";

  try {
    const versions = await listVersions();
    if (versions.length === 0) {
      emptyEl.style.display = "block";
    } else {
      for (const version of versions) {
        listEl.appendChild(createVersionItem(version));
      }
    }
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to load versions.", true);
  } finally {
    loadingEl.style.display = "none";
  }
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

function createVersionItem(version: Version): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "pptvc-version-item";

  const info = document.createElement("div");
  info.className = "pptvc-version-info";

  const name = document.createElement("span");
  name.className = "pptvc-version-name ms-font-s";
  name.textContent = version.name;

  const time = document.createElement("span");
  time.className = "pptvc-version-time ms-font-xs";
  time.textContent = formatTimestamp(version.timestamp);

  info.appendChild(name);
  info.appendChild(time);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pptvc-btn pptvc-btn--secondary ms-font-s";
  btn.textContent = "Restore";
  btn.addEventListener("click", () => {
    void onRestoreClick(version.id, btn);
  });

  li.appendChild(info);
  li.appendChild(btn);

  return li;
}

async function onSaveClick(): Promise<void> {
  const btn = getEl<HTMLButtonElement>("btn-save");
  const label = btn.querySelector<HTMLSpanElement>(".btn-label")!;
  const spinner = btn.querySelector<HTMLSpanElement>(".btn-spinner")!;

  btn.disabled = true;
  label.style.display = "none";
  spinner.style.display = "inline-block";

  try {
    const version = await saveVersion();
    showStatus(`Saved: ${version.name}`, false);
    await loadVersionList();
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to save version.", true);
  } finally {
    btn.disabled = false;
    label.style.display = "";
    spinner.style.display = "";
  }
}

async function onRestoreClick(id: string, btn: HTMLButtonElement): Promise<void> {
  const originalText = btn.textContent ?? "Restore";
  btn.disabled = true;
  btn.textContent = "Restoring…";

  try {
    await restoreVersion(id);
    showStatus("Restored successfully.", false);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : "Failed to restore version.", true);
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
