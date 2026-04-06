import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import logoIcon from "../../assets/icon.png";

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
      <div className="mx-auto flex min-h-full w-full max-w-[460px] flex-col items-center px-3.5 py-5 text-center">
        <div className="flex flex-1 flex-col items-center justify-center w-full">
          {!showChoice ? (
            <div className="flex flex-col items-center justify-center gap-3">
              <img
                src={logoIcon}
                alt="Gedonus logo"
                className="h-12 w-12 animate-[spin_1.1s_linear_infinite]"
              />
              <p className="text-[12px] text-[var(--color-text-muted)]">Preparing your workspace...</p>
            </div>
          ) : (
            <div className="w-full space-y-5">
              <div className="space-y-2">
                <p className="m-0 text-[10px] tracking-[0.16em] uppercase text-[var(--color-text-muted)]">
                  GEDONUS
                </p>
                <h2 className="header-slogan m-0 text-[20px] leading-[1.08] text-[var(--color-text)]">
                  Start your <span className="italic">workflow</span>
                </h2>
                <p className="mx-auto max-w-[34ch] text-[12px] leading-[1.5] text-[var(--color-text-muted)]">
                  Track PowerPoint versions locally, compare changes slide by slide, and optionally
                  sync snapshots to GitHub for team workflows.
                </p>
              </div>

              <div className="mx-auto grid w-full max-w-[340px] grid-cols-1 gap-2 sm:grid-cols-2">
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

        <p className="mt-6 text-[10px] text-[var(--color-text-muted)]">
          © 2026 Gedonus. All rights reserved.
        </p>
      </div>
    </div>
  );
}
