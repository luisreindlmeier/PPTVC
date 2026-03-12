/* global HTMLElement, window */

import { getEl } from "./dom";

const STATUS_TIMEOUT_MS = 4000;

export function showStatus(message: string, isError: boolean): void {
  const el = getEl<HTMLElement>("status-msg");
  el.textContent = message;
  el.className = `pptvc-status ${isError ? "pptvc-status--error" : "pptvc-status--success"}`;

  window.setTimeout(() => {
    el.textContent = "";
    el.className = "pptvc-status";
  }, STATUS_TIMEOUT_MS);
}
