/* global document, HTMLElement */

export function getEl<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function hide(el: HTMLElement): void {
  el.classList.add("pptvc-hidden");
}

export function show(el: HTMLElement): void {
  el.classList.remove("pptvc-hidden");
}
