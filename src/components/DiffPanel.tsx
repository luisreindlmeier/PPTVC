import { useState, useEffect, useRef } from "react";
import type { Version } from "../versions";
import type { SlideInfo } from "../App";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface SlideComparison {
  fromVersion: Version;
  toVersion: Version;
}

interface DiffPanelProps {
  versions: Version[];
  currentSlide: SlideInfo;
  preselectedId?: string;
  getVersionName: (v: Version) => string;
  getVersionBlob: (path: string) => Promise<Blob>;
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
  formatTimestamp: (ts: number) => string;
  getAuthorLabel: (v: Version) => string;
  showStatus: (msg: string, isError: boolean) => void;
}

export function DiffPanel({
  versions,
  currentSlide,
  preselectedId,
  getVersionName,
  getVersionBlob,
  buildComparisonSlide,
  blobToBase64,
  replacePresentationFromBase64,
  restoreVersionById,
  formatTimestamp,
  getAuthorLabel,
  showStatus,
}: DiffPanelProps) {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [bannerText, setBannerText] = useState("");
  const [clearing, setClearing] = useState(false);
  const activeComparisons = useRef(new Map<number, SlideComparison>());

  // Initialise selectors when versions load or preselection changes
  useEffect(() => {
    if (versions.length < 2) return;
    if (preselectedId) {
      const idx = versions.findIndex((v) => v.id === preselectedId);
      setToId(preselectedId);
      const fromIdx = idx + 1 < versions.length ? idx + 1 : 0;
      setFromId(versions[fromIdx].id);
    } else {
      setFromId(versions[1].id);
      setToId(versions[0].id);
    }
  }, [versions, preselectedId]);

  // Sync banner when slide changes
  useEffect(() => {
    const comp = activeComparisons.current.get(currentSlide.num);
    if (!comp) {
      setBannerVisible(false);
      return;
    }
    setBannerText(
      `Scroll down on the slide to see "${getVersionName(comp.fromVersion)}" below "${getVersionName(comp.toVersion)}"`
    );
    setBannerVisible(true);
  }, [currentSlide.num, getVersionName]);

  if (versions.length < 2) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-[12px] text-[var(--color-text-muted)]">
          Save at least two versions to compare.
        </p>
      </div>
    );
  }

  const fromVersion = versions.find((v) => v.id === fromId);
  const toVersion = versions.find((v) => v.id === toId);

  const handleCompare = async () => {
    if (!fromVersion || !toVersion || fromVersion.id === toVersion.id) return;
    setComparing(true);
    setBannerVisible(false);
    try {
      const [toBlob, fromBlob] = await Promise.all([
        getVersionBlob(toVersion.snapshotPath),
        getVersionBlob(fromVersion.snapshotPath),
      ]);
      const slideIdx = currentSlide.num - 1;
      const modifiedBlob = await buildComparisonSlide(
        toBlob,
        fromBlob,
        slideIdx,
        getVersionName(toVersion),
        getVersionName(fromVersion),
        formatTimestamp(toVersion.timestamp),
        getAuthorLabel(toVersion)
      );
      await replacePresentationFromBase64(await blobToBase64(modifiedBlob));
      activeComparisons.current.set(currentSlide.num, { fromVersion, toVersion });
      setBannerText(
        `Scroll down on the slide to see "${getVersionName(fromVersion)}" below "${getVersionName(toVersion)}"`
      );
      setBannerVisible(true);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "Failed to build comparison.", true);
    } finally {
      setComparing(false);
    }
  };

  const handleClear = async () => {
    const comp = activeComparisons.current.get(currentSlide.num);
    if (!comp) return;
    setClearing(true);
    try {
      await restoreVersionById(comp.toVersion.id);
      activeComparisons.current.delete(currentSlide.num);
      setBannerVisible(false);
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "Failed to clear comparison.", true);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col px-3.5 pt-3 gap-3 overflow-y-auto">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Comparing
      </h3>

      <div className="flex flex-col gap-2">
        {/* From / To selectors */}
        <div className="flex items-center gap-2">
          <div className="diff-select-wrap flex-1">
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              aria-label="From version"
              className="w-full h-7 text-[12px] px-2 rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] appearance-none pr-7 cursor-pointer"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {getVersionName(v)}
                </option>
              ))}
            </select>
            <span className="diff-select-caret">
              <svg viewBox="0 0 10 6" fill="currentColor" aria-hidden="true">
                <path d="M0 0l5 6 5-6H0z" />
              </svg>
            </span>
          </div>

          <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">→</span>

          <div className="diff-select-wrap flex-1">
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              aria-label="To version"
              className="w-full h-7 text-[12px] px-2 rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] appearance-none pr-7 cursor-pointer"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {getVersionName(v)}
                </option>
              ))}
            </select>
            <span className="diff-select-caret">
              <svg viewBox="0 0 10 6" fill="currentColor" aria-hidden="true">
                <path d="M0 0l5 6 5-6H0z" />
              </svg>
            </span>
          </div>
        </div>

        <Button
          onClick={() => void handleCompare()}
          disabled={comparing || !fromVersion || !toVersion || fromId === toId}
          className="w-full h-7 text-[12px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
        >
          {comparing ? <span className="btn-spinner" aria-hidden="true" /> : "Compare Versions"}
        </Button>
      </div>

      {/* Active comparison banner */}
      {bannerVisible && (
        <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary-light)] border border-[var(--color-primary)]/20 text-[11px]">
          <span className="text-[var(--color-primary)] leading-snug">{bannerText}</span>
          <button
            type="button"
            onClick={() => void handleClear()}
            disabled={clearing}
            className="shrink-0 text-[var(--color-primary)] underline hover:no-underline cursor-pointer disabled:opacity-50"
          >
            {clearing ? "…" : "Clear"}
          </button>
        </div>
      )}
    </div>
  );
}
