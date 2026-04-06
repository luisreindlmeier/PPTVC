import { useState } from "react";
import type { UserSettings } from "../storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { IconChevronLeft } from "./icons";
import { GitHubSyncSettings } from "./GitHubSyncSettings";
import { DEFAULT_SETTINGS, getAvailableTags } from "../taskpane/settings-model";
import { cn } from "@/lib/utils";

type SettingsTab = "general" | "storage" | "versioning" | "tags";
const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "storage", label: "Storage" },
  { id: "versioning", label: "Versioning" },
  { id: "tags", label: "Tags" },
];

interface SettingsPageProps {
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => Promise<void>;
  onClose: () => void;
  calculateStorageUsage: () => Promise<number>;
  formatBytes: (n: number) => string;
  onExportZip: () => Promise<void>;
  showStatus: (msg: string, isError: boolean) => void;
  onVersionsReload: () => Promise<void>;
  enforceMaxVersions: () => Promise<void>;
}

function SectionHeader({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] whitespace-nowrap">
        {label}
      </h3>
      <div className="flex-1 h-px bg-[var(--color-border)]" />
      {tooltip && (
        <span
          title={tooltip}
          className="w-4 h-4 rounded-full border border-[var(--color-border)] text-[10px] text-[var(--color-text-muted)] flex items-center justify-center cursor-default shrink-0"
          aria-label={tooltip}
        >
          i
        </span>
      )}
    </div>
  );
}

export function SettingsPage({
  settings,
  onSettingsChange,
  onClose,
  calculateStorageUsage,
  formatBytes,
  onExportZip,
  showStatus,
  onVersionsReload,
  enforceMaxVersions,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [storageText, setStorageText] = useState<string>("Calculating...");
  const [exporting, setExporting] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const tabIdx = TABS.findIndex((t) => t.id === activeTab);
  const hasConnectedRepo = Boolean(settings.githubSync?.repo?.trim() && settings.githubSync.installationId);

  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    void onSettingsChange(next);
    if (patch.maxVersions !== undefined || "maxVersions" in patch) {
      void enforceMaxVersions().then(onVersionsReload);
    }
  };

  const handleTabClick = async (tab: SettingsTab) => {
    setActiveTab(tab);
    if (tab === "storage") {
      setStorageText("Calculating...");
      try {
        const bytes = await calculateStorageUsage();
        setStorageText(`${formatBytes(bytes)} used`);
      } catch {
        setStorageText("Unable to calculate");
      }
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExportZip();
    } catch (err) {
      showStatus(err instanceof Error ? err.message : "Failed to export.", true);
    } finally {
      setExporting(false);
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    const current = settings.customTags ?? [];
    if (current.includes(tag)) return;
    update({ customTags: [...current, tag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    update({ customTags: (settings.customTags ?? []).filter((t) => t !== tag) });
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-border)] shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="p-1 rounded hover:bg-[var(--color-border)] transition-colors cursor-pointer"
        >
          <IconChevronLeft className="w-4 h-4 text-[var(--color-text-muted)]" />
        </button>
        <h2 className="text-[13px] text-[var(--color-text)]">Settings</h2>
      </header>

      {/* Tab bar */}
      <div className="px-3 pt-2 shrink-0">
        <div
          role="tablist"
          className="relative flex rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-0.5"
        >
          <div
            className="absolute top-0.5 bottom-0.5 rounded-[var(--radius-xs)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-subtle)] transition-transform duration-200"
            style={{
              width: `calc(${100 / TABS.length}% - 2px)`,
              left: "2px",
              transform: `translateX(calc(${tabIdx * 100}% + ${tabIdx}px))`,
            }}
          />
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => void handleTabClick(tab.id)}
              className={cn(
                "relative flex-1 z-10 px-1 py-1 text-[10px] rounded-[var(--radius-xs)] transition-colors cursor-pointer",
                activeTab === tab.id
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Panels */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* ── General ─────────────────────────────────────────── */}
        {activeTab === "general" && (
          <>
            <div>
              <SectionHeader
                label="Account"
                tooltip="Name and email are saved in each version's metadata so collaborators can see who made changes."
              />
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="s-name" className="text-[11px] text-[var(--color-text-muted)]">
                    Name
                  </Label>
                  <Input
                    id="s-name"
                    defaultValue={settings.authorName ?? ""}
                    onBlur={(e) => update({ authorName: e.target.value.trim() })}
                    placeholder="Your name"
                    autoComplete="name"
                    className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s-email" className="text-[11px] text-[var(--color-text-muted)]">
                    Email
                  </Label>
                  <Input
                    id="s-email"
                    type="email"
                    defaultValue={settings.email ?? ""}
                    onBlur={(e) => update({ email: e.target.value.trim() })}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-[var(--color-border)]" />

            <div>
              <SectionHeader
                label="GitHub Auto-Sync"
                tooltip="When enabled, each new version created from the taskpane is synced to the connected GitHub repository."
              />
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={settings.autoSyncOnVersionSave ?? false}
                  onCheckedChange={(v) => update({ autoSyncOnVersionSave: v })}
                  disabled={!hasConnectedRepo}
                  className="data-[state=checked]:bg-[var(--color-primary)]"
                />
                <span className="text-[12px] text-[var(--color-text)]">
                  Auto-sync new versions to GitHub
                </span>
              </label>
              {!hasConnectedRepo && (
                <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                  Connect a repository first to enable auto-sync.
                </p>
              )}
            </div>

            <Separator className="bg-[var(--color-border)]" />

            <div>
              <SectionHeader
                label="Integrations"
                tooltip="Connect to GitHub or GitLab when available."
              />
              <GitHubSyncSettings settings={settings} onSettingsChange={onSettingsChange} />
            </div>
          </>
        )}

        {/* ── Storage ─────────────────────────────────────────── */}
        {activeTab === "storage" && (
          <>
            <div>
              <SectionHeader
                label="Storage Usage"
                tooltip="OPFS data can be cleared by browser resets. Export regularly to keep a backup."
              />
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[var(--color-text-muted)]">Used</span>
                <span className="text-[var(--color-text)]">{storageText}</span>
              </div>
            </div>

            <Separator className="bg-[var(--color-border)]" />

            <div>
              <SectionHeader
                label="Export / Backup"
                tooltip="Download a ZIP containing all versions and metadata."
              />
              <Button
                onClick={() => void handleExport()}
                disabled={exporting}
                className="w-full h-7 text-[12px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
              >
                {exporting ? <span className="btn-spinner" aria-hidden="true" /> : "Download ZIP"}
              </Button>
            </div>
          </>
        )}

        {/* ── Versioning ──────────────────────────────────────── */}
        {activeTab === "versioning" && (
          <>
            <div>
              <SectionHeader
                label="Max Versions"
                tooltip="When enabled, the oldest versions are deleted after the limit is reached."
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={settings.maxVersions !== undefined}
                    onCheckedChange={(v) => update({ maxVersions: v ? 20 : undefined })}
                    className="data-[state=checked]:bg-[var(--color-primary)]"
                  />
                  <span className="text-[12px] text-[var(--color-text)]">Enable limit</span>
                </label>
                <Input
                  type="number"
                  min={1}
                  disabled={settings.maxVersions === undefined}
                  defaultValue={settings.maxVersions ?? ""}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isFinite(v) && v > 0) update({ maxVersions: v });
                  }}
                  placeholder="20"
                  className="w-20 h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)] disabled:opacity-50"
                />
              </div>
            </div>

            <Separator className="bg-[var(--color-border)]" />

            <div>
              <SectionHeader
                label="Naming Scheme"
                tooltip="Choose how new versions are named when the input is empty."
              />
              <div className="space-y-1 mb-2">
                <Label htmlFor="s-template" className="text-[11px] text-[var(--color-text-muted)]">
                  Naming Template
                </Label>
                <Input
                  id="s-template"
                  defaultValue={settings.namingTemplate ?? DEFAULT_SETTINGS.namingTemplate}
                  onBlur={(e) =>
                    update({
                      namingTemplate: e.target.value.trim() || DEFAULT_SETTINGS.namingTemplate!,
                    })
                  }
                  placeholder="Version {version_number}"
                  className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
                />
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-1">
                Use variables in curly braces to build names dynamically:
              </p>
              <table className="settings-hint-table">
                <thead>
                  <tr>
                    <th>Variable</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["{version_number}", "12"],
                    ["{date}", "Mar 12, 2026"],
                    ["{time}", "18:04"],
                    ["{datetime}", "Mar 12, 2026 18:04"],
                  ].map(([v, ex]) => (
                    <tr key={v}>
                      <td>
                        <code>{v}</code>
                      </td>
                      <td>{ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Tags ────────────────────────────────────────────── */}
        {activeTab === "tags" && (
          <div>
            <SectionHeader
              label="Custom Tags"
              tooltip="Override the predefined tag list used in version tagging."
            />
            <div className="flex gap-2 mb-3">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag"
                className="flex-1 h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addTag}
                className="h-7 text-[11px] border-[var(--color-border)] cursor-pointer"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(settings.customTags ?? []).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="h-5 text-[10px] px-1.5 gap-1 bg-[var(--color-tag-bg)] text-[var(--color-tag-text)] border-0"
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
