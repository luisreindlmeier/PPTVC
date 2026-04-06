import { useMemo, useState } from "react";
import type { GitHubSyncConfig } from "../storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { getAppInstallUrl, findInstallation, testGitHubConnection } from "../sync/github-sync";

interface GitHubOnboardingGateProps {
  initialConfig?: GitHubSyncConfig;
  accountConnected: boolean;
  onSkip: () => void;
  onConnected: (
    config: GitHubSyncConfig,
    accountConnected: boolean,
    accountLogin?: string
  ) => Promise<void>;
}

function extractOwner(repoValue: string): string {
  const trimmed = repoValue.trim();
  if (!trimmed.includes("/")) return "";
  return trimmed.split("/")[0]?.trim() ?? "";
}

export function GitHubOnboardingGate({
  initialConfig,
  accountConnected,
  onSkip,
  onConnected,
}: GitHubOnboardingGateProps) {
  const initialRepo = initialConfig?.repo ?? "";
  const initialOwner = extractOwner(initialRepo);
  const [accountName, setAccountName] = useState(initialOwner);
  const [repoName, setRepoName] = useState(() => {
    if (!initialRepo) return "";
    if (initialOwner && initialRepo.startsWith(`${initialOwner}/`)) {
      return initialRepo.slice(initialOwner.length + 1);
    }
    return initialRepo;
  });
  const [branch, setBranch] = useState(
    initialConfig?.branch === "main" ? "" : (initialConfig?.branch ?? "")
  );
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [accountLinkedInSession, setAccountLinkedInSession] = useState(accountConnected);

  const canLinkRepo = accountConnected || accountLinkedInSession;
  const fullRepo = useMemo(() => {
    const trimmedRepo = repoName.trim();
    if (!trimmedRepo) return "";
    if (!canLinkRepo) return "";

    if (!accountName) {
      return trimmedRepo;
    }

    if (trimmedRepo.includes("/")) {
      return trimmedRepo;
    }

    return `${accountName}/${trimmedRepo}`;
  }, [accountName, canLinkRepo, repoName]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getAppInstallUrl();
      if (!url) return;
      window.open(url, "_blank", "noopener,noreferrer");
      setAccountLinkedInSession(true);
    } finally {
      setConnecting(false);
    }
  };

  const handleConfirmRepo = async () => {
    if (!fullRepo || !canLinkRepo) return;

    setConfirming(true);
    try {
      const installation = await findInstallation(fullRepo);
      if (installation === null) {
        return;
      }

      const config: GitHubSyncConfig = {
        repo: fullRepo,
        branch: branch.trim() || "main",
        installationId: installation.installationId,
      };

      await testGitHubConnection(config);

      await onConnected(config, true, installation.accountLogin);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 bg-[var(--color-bg)] overflow-y-auto">
      <div className="mx-auto w-full max-w-[460px] px-3.5 pt-5 pb-4">
        <div className="min-w-0 pr-2">
          <h2 className="header-slogan m-0 text-[20px] leading-[1.08] text-[var(--color-text)]">
            Connect GitHub before you start
          </h2>
          <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-text-muted)]">
            Link this PowerPoint to a repository to sync snapshots. You can also skip and continue
            with local versioning.
          </p>
        </div>

        {!canLinkRepo ? (
          <div className="mt-4 space-y-1.5">
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Connect your GitHub account to enable repository sync.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleConnect()}
              disabled={connecting}
              className="w-full h-7 text-[11px] border-[var(--color-border)] cursor-pointer"
            >
              {connecting ? "Opening..." : "Connect account"}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-[var(--radius-xs)] border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-1.5 text-[11px] text-[#166534]">
              {accountName ? (
                <>
                  GitHub account connected as <span className="font-medium">{accountName}</span>.
                </>
              ) : (
                <>GitHub account connected. Connect a repository to resolve the account name.</>
              )}
            </div>

            <div className="mt-4 space-y-1.5">
              <Label htmlFor="onboarding-repo" className="text-[11px] text-[var(--color-text-muted)]">
                Repository
              </Label>
              {accountName ? (
                <div className="flex items-center h-7 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-raised)] overflow-hidden">
                  <span className="px-2 text-[12px] text-[var(--color-text-muted)] border-r border-[var(--color-border)] shrink-0 whitespace-nowrap leading-none">
                    {accountName + "/"}
                  </span>
                  <Input
                    id="onboarding-repo"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="repository-name"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-7 text-[12px] border-0 shadow-none rounded-none"
                  />
                </div>
              ) : (
                <Input
                  id="onboarding-repo"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="owner/repository-name"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
                />
              )}
            </div>

            <div className="mt-3 space-y-1.5">
              <Label htmlFor="onboarding-branch" className="text-[11px] text-[var(--color-text-muted)]">
                Branch
              </Label>
              <Input
                id="onboarding-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                autoComplete="off"
                spellCheck={false}
                className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
              />
            </div>

            <div className="mt-4">
              <Button
                size="sm"
                onClick={() => void handleConfirmRepo()}
                disabled={confirming || connecting || !fullRepo}
                className="w-full h-7 text-[11px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
              >
                {confirming ? "Checking..." : "Connect this repository"}
              </Button>
            </div>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="mt-1 w-full h-7 text-[11px] text-[var(--color-text-muted)] cursor-pointer"
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
