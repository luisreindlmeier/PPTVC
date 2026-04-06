import { useState, useEffect } from "react";
import type { UserSettings, GitHubSyncConfig } from "../storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  pushVersionsToGitHub,
  getAppInstallUrl,
  findInstallation,
  testGedonusCommit,
} from "../sync/github-sync";
import { listVersions, getVersionBlob } from "../versions";
import { cn } from "@/lib/utils";

interface GitHubSyncSettingsProps {
  settings: UserSettings;
  onSettingsChange: (next: UserSettings) => Promise<void>;
}

interface SyncStatus {
  message: string;
  isError: boolean;
}

export function GitHubSyncSettings({ settings, onSettingsChange }: GitHubSyncSettingsProps) {
  const [repo, setRepo] = useState(settings.githubSync?.repo ?? "");
  const [branch, setBranch] = useState(
    settings.githubSync?.branch !== "main" ? (settings.githubSync?.branch ?? "") : ""
  );
  const [installationId, setInstallationId] = useState<number | undefined>(
    settings.githubSync?.installationId
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [testCommitting, setTestCommitting] = useState(false);

  const isConnected = installationId !== undefined;

  const getSyncConfig = (): GitHubSyncConfig => ({
    repo: repo.trim(),
    branch: branch.trim() || "main",
    ...(installationId !== undefined ? { installationId } : {}),
  });

  const persist = async (overrides?: Partial<GitHubSyncConfig>) => {
    const cfg = { ...getSyncConfig(), ...overrides };
    const next: UserSettings = { ...settings };
    if (cfg.repo) next.githubSync = cfg;
    else delete next.githubSync;
    await onSettingsChange(next);
  };

  const handleConnect = async () => {
    if (!repo.trim()) {
      setSyncStatus({ message: "Enter a repository first.", isError: true });
      return;
    }
    setConnecting(true);
    try {
      const url = await getAppInstallUrl();
      if (!url) {
        setSyncStatus({ message: "Could not reach Gedonus service.", isError: true });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setConnecting(false);
    }
  };

  const handleConfirm = async () => {
    if (!repo.trim()) {
      setSyncStatus({ message: "Enter a repository first.", isError: true });
      return;
    }
    setConfirming(true);
    try {
      const id = await findInstallation(repo.trim());
      if (id === null) {
        setSyncStatus({
          message: "App not found on this repo. Install it via 'Connect Gedonus' first.",
          isError: true,
        });
        return;
      }
      setInstallationId(id);
      await persist({ installationId: id });
      setSyncStatus({ message: "Gedonus connected.", isError: false });
    } finally {
      setConfirming(false);
    }
  };

  const handleDisconnect = async () => {
    setInstallationId(undefined);
    await persist({ installationId: undefined });
    setSyncStatus(null);
  };

  const handleSync = async () => {
    const cfg = getSyncConfig();
    if (!cfg.repo) {
      setSyncStatus({ message: "Enter a repository first.", isError: true });
      return;
    }
    if (!cfg.installationId) {
      setSyncStatus({ message: "Connect Gedonus first.", isError: true });
      return;
    }
    setSyncing(true);
    setSyncStatus({ message: "Starting sync...", isError: false });
    try {
      const versions = await listVersions();
      if (versions.length === 0) {
        setSyncStatus({ message: "No versions to sync.", isError: false });
        return;
      }
      const result = await pushVersionsToGitHub(cfg, versions, getVersionBlob, (p) => {
        setSyncStatus({ message: `${p.label} (${p.current}/${p.total})`, isError: false });
      });
      await persist();
      setSyncStatus(
        result.errors.length === 0
          ? { message: `Synced ${result.pushed} files to ${cfg.repo}.`, isError: false }
          : {
              message: `Synced ${result.pushed} files. ${result.errors.length} error(s): ${result.errors[0]}`,
              isError: true,
            }
      );
    } catch (err) {
      setSyncStatus({
        message: err instanceof Error ? err.message : "Sync failed.",
        isError: true,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleTestCommit = async () => {
    setTestCommitting(true);
    try {
      await testGedonusCommit(getSyncConfig());
      setSyncStatus({
        message: "Test commit created. Check your repo — Gedonus should appear as committer.",
        isError: false,
      });
    } catch (err) {
      setSyncStatus({
        message: err instanceof Error ? err.message : "Test commit failed.",
        isError: true,
      });
    } finally {
      setTestCommitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="gh-repo" className="text-[11px] text-[var(--color-text-muted)]">
          Repository
        </Label>
        <Input
          id="gh-repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          onBlur={() => void persist()}
          placeholder="owner/repo"
          autoComplete="off"
          spellCheck={false}
          className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gh-branch" className="text-[11px] text-[var(--color-text-muted)]">
          Branch
        </Label>
        <Input
          id="gh-branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          onBlur={() => void persist()}
          placeholder="main"
          autoComplete="off"
          spellCheck={false}
          className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
        />
      </div>

      {/* Gedonus connection */}
      {!isConnected ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={connecting}
              className="flex-1 h-7 text-[11px] border-[var(--color-border)] cursor-pointer"
            >
              {connecting ? "Opening…" : "Connect Gedonus"}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={confirming}
            className="text-[11px] text-[var(--color-text-muted)] underline hover:no-underline cursor-pointer disabled:opacity-50"
          >
            {confirming ? "Checking…" : "I've already installed it"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[var(--color-primary)]">Gedonus connected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleTestCommit()}
              disabled={testCommitting}
              className="text-[var(--color-primary)] underline hover:no-underline cursor-pointer disabled:opacity-50"
            >
              {testCommitting ? "Committing…" : "Test commit"}
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="text-[var(--color-text-muted)] underline hover:no-underline cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {isConnected ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => void handleSync()}
            disabled={syncing}
            className="flex-1 h-7 text-[11px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
          >
            {syncing ? <span className="btn-spinner" aria-hidden="true" /> : "Sync to GitHub"}
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Sync becomes available after the connection is confirmed.
        </p>
      )}

      {/* Status message */}
      {syncStatus && (
        <p
          role="status"
          className={cn(
            "text-[11px] px-2 py-1.5 rounded-[var(--radius-xs)]",
            syncStatus.isError
              ? "bg-[var(--color-danger-light)] text-[var(--color-danger)]"
              : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
          )}
        >
          {syncStatus.message}
        </p>
      )}
    </div>
  );
}
