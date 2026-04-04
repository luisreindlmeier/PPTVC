import { useState, useRef } from "react";
import type { Version } from "../versions";
import type { UserSettings } from "../storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { VersionItem } from "./VersionItem";
import { IconVersions } from "./icons";
import { getAvailableTags, getDefaultVersionName } from "../taskpane/settings-model";
import { MAX_TAGS } from "../ui/constants";
import { cn } from "@/lib/utils";

interface HistoryPanelProps {
  versions: Version[];
  settings: UserSettings;
  displayedVersionId: string | null;
  pendingTags: string[];
  onPendingTagsChange: (tags: string[]) => void;
  onSave: (name: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdateMeta: (id: string, opts: { displayName?: string; tags?: string[] }) => Promise<void>;
  onViewDiff: (id: string) => void;
  getVersionName: (v: Version) => string;
  getAuthorLabel: (v: Version) => string;
}

export function HistoryPanel({
  versions,
  settings,
  displayedVersionId,
  pendingTags,
  onPendingTagsChange,
  onSave,
  onRestore,
  onDelete,
  onUpdateMeta,
  onViewDiff,
  getVersionName,
  getAuthorLabel,
}: HistoryPanelProps) {
  const [saving, setSaving] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<{ id: string; name: string } | null>(
    null
  );
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isDirty = useRef(false);

  const defaultName = getDefaultVersionName(versions.length + 1, settings);
  const availableTags = getAvailableTags(settings);

  const handleSave = async () => {
    const customName = nameInputRef.current?.value.trim() ?? "";
    setSaving(true);
    try {
      await onSave(customName);
      if (nameInputRef.current) {
        nameInputRef.current.value = "";
        isDirty.current = false;
      }
      onPendingTagsChange([]);
      setTagPickerOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = (tag: string) => {
    const idx = pendingTags.indexOf(tag);
    if (idx === -1) {
      if (pendingTags.length < MAX_TAGS) onPendingTagsChange([...pendingTags, tag]);
    } else {
      onPendingTagsChange(pendingTags.filter((t) => t !== tag));
    }
  };

  const displayedIdx = versions.findIndex((v) => v.id === displayedVersionId);

  const handleConfirmRestore = async () => {
    if (!restoreCandidate) return;
    setRestoringId(restoreCandidate.id);
    try {
      await onRestore(restoreCandidate.id);
      setRestoreCandidate(null);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* ── Save panel ────────────────────────────────────────── */}
      <section className="px-3.5 pt-3 pb-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] shrink-0">
        <h2 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          Save New Version
          {versions.length > 0 && (
            <span className="ml-1 font-normal normal-case tracking-normal">
              ({versions.length})
            </span>
          )}
        </h2>

        <div className="flex gap-1.5 mb-2">
          <Input
            ref={nameInputRef}
            placeholder={defaultName}
            maxLength={60}
            aria-label="Version name"
            onChange={() => {
              isDirty.current = true;
            }}
            className="flex-1 h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)] focus-visible:ring-[var(--color-border-focus)] placeholder:text-[var(--color-text-placeholder)]"
          />
          <button
            type="button"
            onClick={() => setTagPickerOpen((o) => !o)}
            aria-expanded={tagPickerOpen}
            aria-label="Add tags"
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-[var(--radius-sm)] border text-[var(--color-text-muted)] transition-colors cursor-pointer shrink-0",
              tagPickerOpen
                ? "border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-focus)]"
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 10 6"
              fill="currentColor"
              className="w-2.5 h-2.5"
              aria-hidden="true"
            >
              <path d="M0 0l5 6 5-6H0z" />
            </svg>
          </button>
        </div>

        {tagPickerOpen && (
          <div className="flex flex-wrap gap-1 mb-2">
            {availableTags.map((tag) => {
              const selected = pendingTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  disabled={!selected && pendingTags.length >= MAX_TAGS}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "h-5 text-[10px] px-2 rounded-[3px] border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                    selected
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-tag-bg)] hover:text-[var(--color-tag-text)]"
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full h-7 text-[12px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
        >
          {saving ? <span className="btn-spinner" aria-hidden="true" /> : "Save Version"}
        </Button>
      </section>

      {/* ── Version list ──────────────────────────────────────── */}
      <section className="flex-1 overflow-y-auto px-5">
        <div className="flex items-center gap-2 pt-3 pb-2 sticky top-0 bg-[var(--color-bg)] z-10">
          <h2 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1">
            <IconVersions className="w-3.5 h-3.5" />
            History
          </h2>
          {versions.length > 0 && (
            <span className="text-[11px] text-[var(--color-text-muted)]">
              {versions.length} {versions.length === 1 ? "version" : "versions"}
            </span>
          )}
        </div>

        {versions.length === 0 ? (
          <p className="py-4 text-[12px] text-[var(--color-text-muted)]">No versions saved yet.</p>
        ) : (
          <ul role="list" className="versions-timeline relative pl-7 pr-4 pt-1">
            {versions.map((version, idx) => (
              <VersionItem
                key={version.id}
                version={version}
                settings={settings}
                isDisplayed={version.id === displayedVersionId}
                isNewer={displayedIdx !== -1 && idx < displayedIdx}
                authorLabel={getAuthorLabel(version)}
                isRestoring={restoringId === version.id}
                onRequestRestore={() =>
                  setRestoreCandidate({ id: version.id, name: getVersionName(version) })
                }
                onDelete={() => onDelete(version.id)}
                onUpdateMeta={(opts) => onUpdateMeta(version.id, opts)}
                onViewDiff={() => onViewDiff(version.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {restoreCandidate && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/20 px-4">
          <div className="relative w-full max-w-[320px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-[var(--shadow-elevated)]">
            <button
              type="button"
              onClick={() => setRestoreCandidate(null)}
              aria-label="Close restore dialog"
              className="absolute right-2 top-2 h-6 w-6 rounded-[var(--radius-xs)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            >
              ×
            </button>
            <p className="text-[12px] text-[var(--color-text)] mb-2 leading-snug">
              Restore this version?
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3 truncate">
              {restoreCandidate.name}
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)] mb-3 leading-snug">
              Later versions are not deleted and remain available.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setRestoreCandidate(null)}
                disabled={restoringId !== null}
                className="flex-1 text-[11px] h-7 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => void handleConfirmRestore()}
                disabled={restoringId !== null}
                className="flex-1 text-[11px] h-7 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white cursor-pointer"
              >
                {restoringId !== null ? <span className="btn-spinner" aria-hidden="true" /> : "Restore"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
