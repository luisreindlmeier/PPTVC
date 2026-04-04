import type { SlideInfo } from "../App";

interface HeaderProps {
  currentSlide: SlideInfo;
}

export function Header({ currentSlide }: HeaderProps) {
  return (
    <header className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)] shrink-0">
      <div className="min-w-0 pr-2">
        <p className="m-0 text-[10px] tracking-[0.16em] uppercase text-[var(--color-text-muted)]">GEDONUS</p>
        <h1
            className="header-slogan m-0 mt-1 text-[20px] leading-[1.05] text-[var(--color-text)]"
        >
          Track every <span className="italic">change.</span>
          <br />
          <span className="inline-block whitespace-nowrap">
            Build <span className="italic">great</span> slides with <span className="italic">precision</span>.
          </span>
        </h1>
      </div>

      <div className="shrink-0">
        <div
          className="inline-flex items-center gap-1.5 min-w-[88px] h-6 border border-[var(--color-border)] bg-white/95 text-[var(--color-text)] rounded-full text-[11px] px-2.5 py-1 opacity-70 cursor-default"
          aria-label="Current slide"
        >
          <span>Slide {currentSlide.num}</span>
          <svg
            className="w-3 h-3 opacity-50"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </div>
      </div>
    </header>
  );
}
