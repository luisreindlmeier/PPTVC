import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import logoFilled from "../../assets/logo-filled-80.png";

interface GitHubWelcomeGateProps {
  onConnectGitHub: () => void;
  onContinueWithoutGitHub: () => void;
}

export function GitHubWelcomeGate({
  onConnectGitHub,
  onContinueWithoutGitHub,
}: GitHubWelcomeGateProps) {
  const [showChoice, setShowChoice] = useState(false);

  useEffect(() => {
    const tid = window.setTimeout(() => {
      setShowChoice(true);
    }, 1100);

    return () => window.clearTimeout(tid);
  }, []);

  return (
    <div className="absolute inset-0 z-40 bg-[var(--color-bg)] overflow-y-auto">
      <div className="mx-auto w-full max-w-[460px] px-3.5 pt-8 pb-4">
        {!showChoice ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
            <img
              src={logoFilled}
              alt="Gedonus logo"
              className="h-11 w-11 animate-[spin_1.1s_linear_infinite]"
            />
            <p className="text-[12px] text-[var(--color-text-muted)]">Preparing your workspace...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="header-slogan m-0 text-[22px] leading-[1.08] text-[var(--color-text)]">
                Welcome to Gedonus
              </h2>
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-text-muted)]">
                Track PowerPoint versions locally, compare changes slide by slide, and optionally
                sync snapshots to GitHub for team workflows.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                onClick={onConnectGitHub}
                className="h-7 text-[11px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white border-0 cursor-pointer"
              >
                Connect GitHub
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onContinueWithoutGitHub}
                className="h-7 text-[11px] border-[var(--color-border)] cursor-pointer"
              >
                Continue without GitHub
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
