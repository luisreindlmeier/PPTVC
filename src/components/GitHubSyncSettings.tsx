import { useState, useEffect, useMemo, useRef } from "react";
import type { UserSettings, GitHubSyncConfig } from "../storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  pushVersionsToGitHub,
  getAppInstallUrl,
  findInstallation,
  inspectRepositoryConnectionHint,
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
  tone: "error" | "success" | "warning";
}

function extractOwner(repoValue: string): string {
  const trimmed = repoValue.trim();
  if (!trimmed.includes("/")) return "";
  const owner = trimmed.split("/")[0]?.trim() ?? "";
  return owner;
}

function findKnownOwnerFromDocumentMappings(mapping: UserSettings["githubSyncByDocument"]): string {
  if (!mapping) return "";
  for (const config of Object.values(mapping)) {
    const owner = extractOwner(config.repo);
    if (owner) return owner;
  }
  return "";
}

function collectKnownRepos(settings: UserSettings): string[] {
  const repos = new Set<string>();
  const directRepo = settings.githubSync?.repo?.trim();
  if (directRepo && directRepo.includes("/")) repos.add(directRepo);

  const mapping = settings.githubSyncByDocument;
  if (mapping) {
    for (const cfg of Object.values(mapping)) {
      const repo = cfg.repo?.trim();
      if (repo && repo.includes("/")) repos.add(repo);
    }
  }

  return [...repos];
}

export function GitHubSyncSettings({ settings, onSettingsChange }: GitHubSyncSettingsProps) {
  const initialRepo = settings.githubSync?.repo ?? "";
  const explicitAccountName = settings.githubAccountName?.trim() ?? "";
  const ownerFromSettingsRepo = extractOwner(settings.githubSync?.repo ?? "");
  const ownerFromAnyKnownRepo = findKnownOwnerFromDocumentMappings(settings.githubSyncByDocument);
  const [repoName, setRepoName] = useState(() => {
    if (!initialRepo) return "";
    if (explicitAccountName && initialRepo.startsWith(`${explicitAccountName}/`)) {
      return initialRepo.slice(explicitAccountName.length + 1);
    }
    return initialRepo;
  });
  const [branch, setBranch] = useState(
    settings.githubSync?.branch !== "main" ? (settings.githubSync?.branch ?? "") : ""
  );
  const [installationId, setInstallationId] = useState<number | undefined>(
    settings.githubSync?.installationId
  );
  const [, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const [accountCheckDone, setAccountCheckDone] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [testCommitting, setTestCommitting] = useState(false);

  const isRepoConnected = installationId !== undefined;
  const isAccountConnected = settings.githubAccountConnected === true;
  const isAutoCheckDisabled = settings.githubAccountAutoCheckDisabled === true;
  const ownerFromInput = extractOwner(repoName);
  const accountName =
    explicitAccountName || ownerFromSettingsRepo || ownerFromAnyKnownRepo || ownerFromInput;
  const accountPrefix = accountName || "owner";
  const knownRepos = useMemo(
    () => collectKnownRepos(settings),
    [settings.githubSync?.repo, settings.githubSyncByDocument]
  );
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (!isAccountConnected && isAutoCheckDisabled) {
      setCheckingAccount(false);
      setAccountCheckDone(true);
    }
  }, [isAccountConnected, isAutoCheckDisabled]);

  useEffect(() => {
    const repo = settings.githubSync?.repo ?? "";
    if (!repo) {
      setRepoName("");
      return;
    }
    if (accountName && repo.startsWith(`${accountName}/`)) {
      setRepoName(repo.slice(accountName.length + 1));
      return;
    }
    setRepoName(repo);
  }, [accountName, settings.githubSync?.repo]);

  useEffect(() => {
    if (!accountName) return;
    const trimmed = repoName.trim();
    if (!trimmed.includes("/")) return;
    if (!trimmed.startsWith(`${accountName}/`)) return;
    setRepoName(trimmed.slice(accountName.length + 1));
  }, [accountName, repoName]);

  useEffect(() => {
    if (isAccountConnected || isAutoCheckDisabled || accountCheckDone || knownRepos.length === 0)
      return;

    let cancelled = false;

    void (async () => {
      setCheckingAccount(true);
      try {
        for (const repo of knownRepos) {
          const installation = await findInstallation(repo);
          if (cancelled) return;
          if (installation === null) continue;

          const current = settingsRef.current;

          const next: UserSettings = {
            ...current,
            githubAccountConnected: true,
            githubAccountName:
              installation.accountLogin ?? current.githubAccountName ?? extractOwner(repo),
            githubAccountAutoCheckDisabled: false,
          };
          await onSettingsChange(next);
          if (cancelled) return;
          setSyncStatus({ message: "Account connected.", tone: "success" });
          setAccountCheckDone(true);
          return;
        }

        setAccountCheckDone(true);
      } finally {
        if (!cancelled) setCheckingAccount(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountCheckDone, isAccountConnected, isAutoCheckDisabled, knownRepos, onSettingsChange]);

  const isShowingAccountCheck = checkingAccount && !isAccountConnected && !isAutoCheckDisabled;

  const fullRepo = (() => {
    if (!isAccountConnected) return "";
    const trimmedRepoName = repoName.trim();
    if (!trimmedRepoName) return "";

    if (!accountName) {
      return trimmedRepoName;
    }

    if (trimmedRepoName.includes("/")) {
      return trimmedRepoName;
    }

    return `${accountName}/${trimmedRepoName}`;
  })();

  const getSyncConfig = (): GitHubSyncConfig => ({
    repo: fullRepo,
    branch: branch.trim() || "main",
    ...(installationId !== undefined ? { installationId } : {}),
  });

  const persist = async (overrides?: Partial<GitHubSyncConfig>) => {
    const cfg = { ...getSyncConfig(), ...overrides };
    const next: UserSettings = { ...settings };
    if (cfg.repo) next.githubSync = cfg;
    else delete next.githubSync;
    next.githubAccountConnected = settings.githubAccountConnected;
    if (accountName) next.githubAccountName = accountName;
    else delete next.githubAccountName;
    await onSettingsChange(next);
  };

  const markAccountConnected = async () => {
    const next: UserSettings = {
      ...settings,
      githubAccountConnected: true,
      githubAccountAutoCheckDisabled: false,
    };
    await onSettingsChange(next);
    setSyncStatus({ message: "GitHub account connected. Select a repository.", tone: "success" });
  };

  const handleAccountDisconnect = async () => {
    setInstallationId(undefined);
    setRepoName("");
    setCheckingAccount(false);
    setAccountCheckDone(true);
    const next: UserSettings = { ...settings };
    delete next.githubSync;
    next.githubAccountConnected = false;
    delete next.githubAccountName;
    next.githubAccountAutoCheckDisabled = true;
    await onSettingsChange(next);
    setSyncStatus({ message: "Account disconnected.", tone: "success" });
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const hasExistingConnectionHint =
        isAccountConnected || accountName.length > 0 || knownRepos.length > 0;

      if (hasExistingConnectionHint) {
        await markAccountConnected();
        return;
      }

      if (isAutoCheckDisabled || accountCheckDone) {
        setAccountCheckDone(false);
        await onSettingsChange({
          ...settings,
          githubAccountAutoCheckDisabled: false,
        });
      }

      const url = await getAppInstallUrl();
      if (!url) {
        setSyncStatus({ message: "Could not reach Gedonus service.", tone: "error" });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      await markAccountConnected();
    } finally {
      setConnecting(false);
    }
  };

  const handleConfirm = async () => {
    if (!isAccountConnected) {
      setSyncStatus({ message: "Connect your GitHub account first.", tone: "error" });
      return;
    }
    if (!fullRepo) {
      setSyncStatus({ message: "Enter a repository first.", tone: "error" });
      return;
    }
    setConfirming(true);
    try {
      const installation = await findInstallation(fullRepo);
      if (installation === null) {
        const [owner, repository] = fullRepo.split("/");
        let repoMissing = false;
        if (owner && repository) {
          try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repository}`);
            repoMissing = res.status === 404;
          } catch {
            repoMissing = false;
          }
        }

        setSyncStatus({
          message: repoMissing
            ? `Repository \"${fullRepo}\" not found. Check the repository name and access.`
            : `Gedonus app is not installed for \"${fullRepo}\". Install the app for this repository, then confirm again.`,
          tone: "error",
        });
        return;
      }

      const config: GitHubSyncConfig = {
        repo: fullRepo,
        branch: branch.trim() || "main",
        installationId: installation.installationId,
      };

      const repoHint = await inspectRepositoryConnectionHint(config);
      const next: UserSettings = {
        ...settings,
        githubAccountConnected: true,
        githubAccountName: installation.accountLogin ?? settings.githubAccountName,
        githubSync: config,
      };
      await onSettingsChange(next);
      setInstallationId(installation.installationId);

      if (repoHint.hasGedonusHistory) {
        setSyncStatus({
          message:
            "This repository already contains Gedonus version history. New syncs will append to existing history.",
          tone: "warning",
        });
      } else if (!repoHint.isEmpty) {
        setSyncStatus({
          message:
            "This repository is not empty. Gedonus will add version data under 'gedonus-versions/'.",
          tone: "warning",
        });
      } else {
        setSyncStatus({ message: "Repository connected.", tone: "success" });
      }
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
      setSyncStatus({ message: "Enter a repository first.", tone: "error" });
      return;
    }
    if (!cfg.installationId) {
      setSyncStatus({ message: "Connect repository first.", tone: "error" });
      return;
    }
    setSyncing(true);
    setSyncStatus({ message: "Starting sync...", tone: "success" });
    try {
      const versions = await listVersions();
      if (versions.length === 0) {
        setSyncStatus({ message: "No versions to sync.", tone: "success" });
        return;
      }
      const result = await pushVersionsToGitHub(cfg, versions, getVersionBlob, (p) => {
        setSyncStatus({ message: `${p.label} (${p.current}/${p.total})`, tone: "success" });
      });
      await persist();
      setSyncStatus(
        result.errors.length === 0
          ? { message: `Synced ${result.pushed} files to ${cfg.repo}.`, tone: "success" }
          : {
              message: `Synced ${result.pushed} files. ${result.errors.length} error(s): ${result.errors[0]}`,
              tone: "error",
            }
      );
    } catch (err) {
      setSyncStatus({
        message: err instanceof Error ? err.message : "Sync failed.",
        tone: "error",
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
        tone: "success",
      });
    } catch (err) {
      setSyncStatus({
        message: err instanceof Error ? err.message : "Test commit failed.",
        tone: "error",
      });
    } finally {
      setTestCommitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {!isAccountConnected ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Connect your GitHub account to enable repository sync.
          </p>
          <Button
            variant={isShowingAccountCheck ? "default" : "outline"}
            size="sm"
            onClick={() => void handleConnect()}
            disabled={connecting || isShowingAccountCheck}
            className={cn(
              "w-full h-7 text-[11px] cursor-pointer",
              isShowingAccountCheck
                ? "bg-[#16a34a] hover:bg-[#15803d] text-white border-0"
                : "border-[var(--color-border)]"
            )}
          >
            {isShowingAccountCheck
              ? "Checking account..."
              : connecting
                ? "Opening…"
                : "Connect account"}
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-[var(--radius-xs)] border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-1.5 text-[11px] text-[#166534]">
            <div className="flex items-center justify-between gap-2">
              <span>
                {accountName ? (
                  <>
                    GitHub account connected as <span className="font-medium">{accountName}</span>.
                  </>
                ) : (
                  <>GitHub account connected. Connect a repository to resolve the account name.</>
                )}
              </span>
              <button
                type="button"
                onClick={() => void handleAccountDisconnect()}
                className="shrink-0 text-[#166534] underline hover:no-underline cursor-pointer"
              >
                Disconnect account
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gh-repo-name" className="text-[11px] text-[var(--color-text-muted)]">
              Repository
            </Label>
            {accountName ? (
              <div className="flex items-center h-7 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
                <span className="px-2 text-[12px] text-[var(--color-text-muted)] border-r border-[var(--color-border)] shrink-0 whitespace-nowrap leading-none">
                  {accountPrefix + "/"}
                </span>
                <Input
                  id="gh-repo-name"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  onBlur={() => void persist()}
                  placeholder="repository-name"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-7 text-[12px] border-0 shadow-none rounded-none"
                />
              </div>
            ) : (
              <Input
                id="gh-repo-name"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                onBlur={() => void persist()}
                placeholder="owner/repository-name"
                autoComplete="off"
                spellCheck={false}
                className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
              />
            )}
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

          {!isRepoConnected ? (
            <div className="pt-1 space-y-1">
              <Button
                size="sm"
                onClick={() => void handleConfirm()}
                disabled={confirming}
                className="w-full h-7 text-[11px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
              >
                {confirming ? "Checking…" : "Connect this repository"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--color-primary)]">Repository connected</span>
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
                  Disconnect repo
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      {isRepoConnected ? (
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
    </div>
  );
}
