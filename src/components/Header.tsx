import type { SlideInfo } from "../App";

interface HeaderProps {
  currentSlide: SlideInfo;
}

export function Header({ currentSlide }: HeaderProps) {
  return (
    <header className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)] shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <img
          src="/assets/icon.png"
          alt="PPTVC"
          className="w-7 h-7 rounded-[6px] shrink-0 object-contain"
        />
        <div>
          <h1 className="m-0 text-[13px] font-semibold tracking-widest uppercase text-[var(--color-text)]">
            PPTVC
          </h1>
          <p className="m-0 text-[10px] text-[var(--color-text-muted)] tracking-[0.01em]">
            Advanced Version Control for PowerPoint
          </p>
        </div>
      </div>

      <div className="shrink-0">
        <div
          className="inline-flex items-center gap-1.5 min-w-[88px] h-6 border border-[var(--color-border)] bg-white/95 text-[var(--color-text)] rounded-full text-[11px] font-medium px-2.5 py-1 opacity-70 cursor-default"
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
