import { useState } from "react";
import type { GitHubSyncConfig } from "../storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { getAppInstallUrl, findInstallation, testGitHubConnection } from "../sync/github-sync";
import { cn } from "@/lib/utils";

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

interface GateStatus {
  text: string;
  isError: boolean;
}

export function GitHubOnboardingGate({
  initialConfig,
  accountConnected,
  onSkip,
  onConnected,
}: GitHubOnboardingGateProps) {
  const [repo, setRepo] = useState(initialConfig?.repo ?? "");
  const [branch, setBranch] = useState(
    initialConfig?.branch === "main" ? "" : (initialConfig?.branch ?? "")
  );
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [accountLinkedInSession, setAccountLinkedInSession] = useState(accountConnected);

  const canLinkRepo = accountConnected || accountLinkedInSession;

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getAppInstallUrl();
      if (!url) {
        setStatus({ text: "Could not reach Gedonus service.", isError: true });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setAccountLinkedInSession(true);
      setStatus({ text: "Install the Gedonus app for your repo, then confirm below.", isError: false });
    } finally {
      setConnecting(false);
    }
  };

  const handleConfirmRepo = async () => {
    const trimmedRepo = repo.trim();
    if (!trimmedRepo) {
      setStatus({ text: "Please enter a repository (owner/repo).", isError: true });
      return;
    }
    if (!canLinkRepo) {
      setStatus({ text: "Connect your GitHub account first.", isError: true });
      return;
    }

    setConfirming(true);
    try {
      const installation = await findInstallation(trimmedRepo);
      if (installation === null) {
        setStatus({
          text: "App not found for this repo. Click 'Connect GitHub' and install the app first.",
          isError: true,
        });
        return;
      }

      const config: GitHubSyncConfig = {
        repo: trimmedRepo,
        branch: branch.trim() || "main",
        installationId,
      };

      await testGitHubConnection(config);

      await onConnected(config, true, installation.accountLogin);

      setStatus({ text: "Repository connected.", isError: false });
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
          {accountConnected && (
            <p className="mt-2 text-[11px] text-[var(--color-primary)]">
              GitHub account already connected.
            </p>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="onboarding-repo" className="text-[11px] text-[var(--color-text-muted)]">
            Repository
          </Label>
          <Input
            id="onboarding-repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="owner/repo"
            autoComplete="off"
            spellCheck={false}
            className="h-7 text-[12px] bg-[var(--color-surface-raised)] border-[var(--color-border)]"
          />
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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleConnect()}
            disabled={connecting || confirming}
            className="h-7 text-[11px] border-[var(--color-border)] cursor-pointer"
          >
            {connecting ? "Opening..." : "Connect account"}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleConfirmRepo()}
            disabled={confirming || connecting || !canLinkRepo}
            className="h-7 text-[11px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
          >
            {confirming ? "Checking..." : "Use this repo"}
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="mt-1 w-full h-7 text-[11px] text-[var(--color-text-muted)] cursor-pointer"
        >
          Skip for now
        </Button>

        {status && (
          <p
            role="status"
            className={cn(
              "text-[11px] px-2 py-1.5 rounded-[var(--radius-xs)]",
              status.isError
                ? "bg-[var(--color-danger-light)] text-[var(--color-danger)]"
                : "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
            )}
          >
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}
