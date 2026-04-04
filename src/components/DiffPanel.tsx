import { useState, useEffect, useRef } from "react";
import type { Version } from "../versions";
import type { SlideInfo } from "../App";
import { Button } from "./ui/button";

interface ActiveComparison {
  fromVersion: Version;
  toVersion: Version;
  slideNum: number;
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
  const [clearing, setClearing] = useState(false);
  const [activeComparison, setActiveComparison] = useState<ActiveComparison | null>(null);
  // Keep a ref so async callbacks can always read the latest value
  const activeComparisonRef = useRef<ActiveComparison | null>(null);
  activeComparisonRef.current = activeComparison;

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

  const closeActiveComparison = async (): Promise<boolean> => {
    const current = activeComparisonRef.current;
    if (!current) return true;
    try {
      await restoreVersionById(current.toVersion.id);
      setActiveComparison(null);
      return true;
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "Failed to close comparison.", true);
      return false;
    }
  };

  const handleCompare = async () => {
    if (!fromVersion || !toVersion || fromVersion.id === toVersion.id) return;
    setComparing(true);
    try {
      // Close any existing comparison first
      if (activeComparisonRef.current) {
        const closed = await closeActiveComparison();
        if (!closed) return;
      }
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
      setActiveComparison({ fromVersion, toVersion, slideNum: currentSlide.num });
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "Failed to build comparison.", true);
    } finally {
      setComparing(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await closeActiveComparison();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <section className="px-3.5 pt-3 pb-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] shrink-0">
        <h3 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          Comparing
        </h3>

        {/* Active comparison indicator */}
        {activeComparison && (
          <div className="flex flex-col gap-1.5 px-3 py-2.5 mb-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wide text-[10px] opacity-70">
                Active comparison — slide {activeComparison.slideNum}
              </span>
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={clearing}
                aria-label="Close comparison"
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-70 hover:opacity-100 hover:bg-white/20 transition-opacity cursor-pointer disabled:opacity-40"
              >
                {clearing ? (
                  <span
                    className="btn-spinner"
                    style={{ borderColor: "white", borderTopColor: "transparent" }}
                    aria-hidden="true"
                  />
                ) : (
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="w-3 h-3"
                    aria-hidden="true"
                  >
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex items-center gap-1.5 opacity-90">
              <span className="truncate max-w-[100px]">
                {getVersionName(activeComparison.fromVersion)}
              </span>
              <span className="opacity-60">→</span>
              <span className="truncate max-w-[100px]">
                {getVersionName(activeComparison.toVersion)}
              </span>
            </div>
            <p className="opacity-60 text-[10px] leading-snug mt-0.5">
              Scroll down on slide {activeComparison.slideNum} to see the diff below it.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {/* From / To selectors */}
          <div className="flex items-center gap-2">
            <div className="diff-select-wrap flex-1">
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                aria-label="From version"
                className="w-full h-7 text-[12px] px-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] appearance-none pr-7 cursor-pointer transition-[color,box-shadow] outline-none hover:border-[var(--color-border)] focus-visible:border-[var(--color-border-focus)] focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)]/30"
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
                className="w-full h-7 text-[12px] px-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] appearance-none pr-7 cursor-pointer transition-[color,box-shadow] outline-none hover:border-[var(--color-border)] focus-visible:border-[var(--color-border-focus)] focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)]/30"
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
            {comparing ? (
              <span className="btn-spinner" aria-hidden="true" />
            ) : activeComparison ? (
              "Replace Comparison"
            ) : (
              "Compare Versions"
            )}
          </Button>
        </div>
      </section>

      <div className="flex-1 overflow-y-auto" />
    </div>
  );
}
