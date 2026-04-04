import { useState, useRef } from "react";
import type { Version } from "../versions";
import type { UserSettings } from "../storage";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { IconDiff, IconRestore, IconTag, IconX } from "./icons";
import { getAvailableTags } from "../taskpane/settings-model";
import { formatTimestamp } from "../ui/format";
import { MAX_TAGS } from "../ui/constants";
import { cn } from "@/lib/utils";

const AVATAR_PALETTE = [
  "#4F6F52",
  "#7B6B8A",
  "#4A7FA5",
  "#8B6B4A",
  "#B87050",
  "#6B4A7F",
  "#4A7F6B",
  "#7F4A6B",
];

function authorColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface VersionItemProps {
  version: Version;
  settings: UserSettings;
  isDisplayed: boolean;
  isNewer: boolean;
  authorLabel: string;
  isRestoring: boolean;
  onRequestRestore: () => void;
  onDelete: () => Promise<void>;
  onUpdateMeta: (opts: { displayName?: string; tags?: string[] }) => Promise<void>;
  onViewDiff: () => void;
}

export function VersionItem({
  version,
  settings,
  isDisplayed,
  isNewer,
  authorLabel,
  isRestoring,
  onRequestRestore,
  onDelete,
  onUpdateMeta,
  onViewDiff,
}: VersionItemProps) {
  const [tags, setTags] = useState<string[]>(version.tags ?? []);
  const [name, setName] = useState(version.displayName ?? version.name);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const availableTags = getAvailableTags(settings).filter((t) => !tags.includes(t));

  const handleNameBlur = () => {
    const trimmed = nameRef.current?.value.trim() ?? "";
    if (trimmed && trimmed !== name) {
      setName(trimmed);
      void onUpdateMeta({ displayName: trimmed });
    } else if (!trimmed) {
      if (nameRef.current) nameRef.current.value = name;
    }
  };

  const addTag = (tag: string) => {
    if (tags.length >= MAX_TAGS) return;
    const next = [...tags, tag];
    setTags(next);
    void onUpdateMeta({ tags: next });
    if (next.length >= MAX_TAGS) setTagPickerOpen(false);
  };

  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    void onUpdateMeta({ tags: next });
  };

  return (
    <li
      className={cn("relative pl-6 pb-3 group", isNewer && "opacity-60")}
      data-version-id={version.id}
    >
      {/* Timeline dot */}
      <button
        type="button"
        aria-label={`Restore ${name}`}
        onClick={onRequestRestore}
        className={cn(
          "absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 transition-all cursor-pointer",
          isDisplayed
            ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]"
        )}
      />

      <div className="transition-transform duration-150 ease-out group-hover:translate-x-0.5">
        {/* Header row: name + actions */}
        <div className="flex items-center gap-1 min-w-0">
        <input
          ref={nameRef}
          defaultValue={name}
          onBlur={handleNameBlur}
          aria-label="Version name"
          className="version-name-input flex-1 min-w-0"
        />
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            onClick={onViewDiff}
            title="View diff"
            aria-label="View diff"
            className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <IconDiff className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRequestRestore}
            disabled={isRestoring}
            title="Restore this version"
            aria-label="Restore this version"
            className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors cursor-pointer disabled:opacity-50"
          >
            {isRestoring ? <span className="btn-spinner" aria-hidden="true" /> : <IconRestore className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            aria-label="Delete version"
            className="p-1 rounded hover:bg-[var(--color-danger-light)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
        </div>

        {/* Meta row: timestamp + tag button */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {formatTimestamp(version.timestamp)}
          </span>
          <button
            type="button"
            onClick={() => setTagPickerOpen((o) => !o)}
            aria-expanded={tagPickerOpen}
            className="flex items-center gap-0.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <IconTag className="w-3 h-3" />
            <span>Tags</span>
          </button>
        </div>

        {/* Author row */}
        <div className="flex items-center gap-1.5 mt-1">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] text-white shrink-0"
            style={{ background: authorColor(authorLabel) }}
            aria-hidden="true"
          >
            {authorInitials(authorLabel)}
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)]">{authorLabel}</span>
        </div>

        {/* Tags row */}
        {(tags.length > 0 || tagPickerOpen) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="h-5 text-[10px] px-1.5 gap-1 bg-[var(--color-tag-bg)] text-[var(--color-tag-text)] hover:bg-[var(--color-tag-bg)] border-0"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  className="ml-0.5 hover:text-[var(--color-danger)] cursor-pointer"
                >
                  ×
                </button>
              </Badge>
            ))}
            {tagPickerOpen && availableTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={tags.length >= MAX_TAGS}
                    onClick={() => addTag(tag)}
                    className="h-5 text-[10px] px-1.5 rounded-[3px] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-tag-bg)] hover:text-[var(--color-tag-text)] hover:border-[var(--color-tag-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete confirm popup */}
        {showDeleteConfirm && (
          <div className="mt-2 p-2.5 rounded-[var(--radius-sm)] bg-[var(--color-danger-light)] border border-[var(--color-danger)]/20">
            <p className="text-[11px] text-[var(--color-text)] mb-2">Delete this version?</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 text-[11px] h-6"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="xs"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  void onDelete();
                }}
                className="flex-1 text-[11px] h-6 bg-[var(--color-danger)] hover:bg-[var(--color-danger-hover)]"
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
