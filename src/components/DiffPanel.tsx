import { useState, useEffect, useRef } from "react";
import type { Version } from "../versions";
import type { SlideInfo } from "../App";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import type { SlideDiffSummary } from "../diff/analyze-slide-diff";

interface ActiveComparison {
  fromVersion: Version;
  toVersion: Version;
  slideNum: number;
  summary: SlideDiffSummary;
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
    toAuthor: string,
    highlightDiffs?: boolean
  ) => Promise<Blob>;
  analyzeSlideDiff: (toBlob: Blob, fromBlob: Blob, slideIndex: number) => Promise<SlideDiffSummary>;
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
  analyzeSlideDiff,
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
  const [highlightDiffs, setHighlightDiffs] = useState(true);
  const [activeComparison, setActiveComparison] = useState<ActiveComparison | null>(null);
  // Keep a ref so async callbacks can always read the latest value
  const activeComparisonRef = useRef<ActiveComparison | null>(null);
  activeComparisonRef.current = activeComparison;
  const latestSlideNumRef = useRef<number>(currentSlide.num);

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

  useEffect(() => {
    const previousSlideNum = latestSlideNumRef.current;
    latestSlideNumRef.current = currentSlide.num;
    if (!activeComparisonRef.current) return;
    if (previousSlideNum === currentSlide.num) return;

    void (async () => {
      const closed = await closeActiveComparison();
      if (closed) {
        showStatus("Exited comparison mode after slide change.", false);
      }
    })();
  }, [currentSlide.num, showStatus]);

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

  const runComparison = async (
    from: Version,
    to: Version,
    enableHighlights: boolean
  ): Promise<boolean> => {
    setComparing(true);
    try {
      if (activeComparisonRef.current) {
        const closed = await closeActiveComparison();
        if (!closed) return false;
      }

      const [toBlob, fromBlob] = await Promise.all([
        getVersionBlob(to.snapshotPath),
        getVersionBlob(from.snapshotPath),
      ]);

      const slideIdx = currentSlide.num - 1;
      const [modifiedBlob, summary] = await Promise.all([
        buildComparisonSlide(
          toBlob,
          fromBlob,
          slideIdx,
          getVersionName(to),
          getVersionName(from),
          formatTimestamp(to.timestamp),
          getAuthorLabel(to),
          enableHighlights
        ),
        analyzeSlideDiff(toBlob, fromBlob, slideIdx),
      ]);

      await replacePresentationFromBase64(await blobToBase64(modifiedBlob));
      setActiveComparison({ fromVersion: from, toVersion: to, slideNum: currentSlide.num, summary });
      return true;
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "Failed to build comparison.", true);
      return false;
    } finally {
      setComparing(false);
    }
  };

  const handleCompare = async () => {
    if (!fromVersion || !toVersion || fromVersion.id === toVersion.id) return;
    await runComparison(fromVersion, toVersion, highlightDiffs);
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

        <div className="flex flex-col gap-2">
          {/* From / To selectors */}
          <div className="flex items-center gap-2">
            <div className="diff-select-wrap flex-1">
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                aria-label="From version"
                className="w-full h-7 text-[12px] px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] appearance-none pr-7 shadow-xs cursor-pointer transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 placeholder:text-[var(--color-text-placeholder)]"
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
                className="w-full h-7 text-[12px] px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] appearance-none pr-7 shadow-xs cursor-pointer transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 placeholder:text-[var(--color-text-placeholder)]"
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
            size="sm"
            disabled={comparing || !fromVersion || !toVersion || fromId === toId}
            className="w-full h-8 px-3 rounded-[var(--radius-sm)] text-[12px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
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

      {/* Active comparison indicator (below divider) */}
      {activeComparison && (
        <section className="px-3.5 pt-2.5 pb-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] shrink-0">
          <div className="flex flex-col gap-1.5 text-[11px] text-[var(--color-text)]">
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wide text-[10px] text-[var(--color-text-muted)]">
                Active comparison — slide {activeComparison.slideNum}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[var(--color-text)]">
              <span className="truncate max-w-[100px]">
                {getVersionName(activeComparison.fromVersion)}
              </span>
              <span className="text-[var(--color-text-muted)]">→</span>
              <span className="truncate max-w-[100px]">
                {getVersionName(activeComparison.toVersion)}
              </span>
            </div>
            <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-text)] mt-0.5 cursor-pointer">
              <span>Highlight diffs</span>
              <Switch
                checked={highlightDiffs}
                onCheckedChange={(nextValue) => {
                  setHighlightDiffs(nextValue);
                  const current = activeComparisonRef.current;
                  if (current) {
                    void runComparison(current.fromVersion, current.toVersion, nextValue);
                  }
                }}
                className="data-[state=checked]:bg-[var(--color-primary)]"
                aria-label="Toggle diff highlights"
              />
            </label>
            <p className="text-[var(--color-text-muted)] text-[10px] leading-snug mt-0.5">
              Scroll down on slide {activeComparison.slideNum} to see the diff below it.
            </p>
            <div className="grid grid-cols-1 gap-2 mt-1">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                  Style changes
                </p>
                {activeComparison.summary.styleChanges.length > 0 ? (
                  <ul className="space-y-0.5">
                    {activeComparison.summary.styleChanges.map((entry, index) => (
                      <li key={`style-${index}`} className="text-[10px] text-[var(--color-text)] leading-snug">
                        • {entry}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-[var(--color-text-muted)]">No style changes detected.</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                  Content changes
                </p>
                {activeComparison.summary.contentChanges.length > 0 ? (
                  <ul className="space-y-0.5">
                    {activeComparison.summary.contentChanges.map((entry, index) => (
                      <li
                        key={`content-${index}`}
                        className="text-[10px] text-[var(--color-text)] leading-snug"
                      >
                        • {entry}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-[var(--color-text-muted)]">No content changes detected.</p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleClear()}
              disabled={clearing}
              className="w-full mt-1 h-8 px-3 rounded-[var(--radius-sm)] text-[12px] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface)] text-[var(--color-text)] border-0 cursor-pointer"
            >
              {clearing ? "Exiting..." : "Exit Comparison Mode"}
            </Button>
          </div>
        </section>
      )}

      <div className="flex-1 overflow-y-auto" />
    </div>
  );
}
