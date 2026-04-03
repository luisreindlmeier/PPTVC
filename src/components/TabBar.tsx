import { useRef, useEffect } from "react";
import type { ScopeTab } from "../App";
import { cn } from "@/lib/utils";

const TABS: { id: ScopeTab; label: string }[] = [
  { id: "history", label: "History" },
  { id: "diff", label: "Diff" },
  { id: "workflow", label: "Workflow" },
];

interface TabBarProps {
  currentTab: ScopeTab;
  onTabChange: (tab: ScopeTab) => void;
}

export function TabBar({ currentTab, onTabChange }: TabBarProps) {
  const activeIndex = TABS.findIndex((t) => t.id === currentTab);
  const bounceTabRef = useRef<string | null>(null);

  const handleClick = (tab: ScopeTab) => {
    bounceTabRef.current = tab;
    onTabChange(tab);
  };

  return (
    <div className="shrink-0 px-3 pt-2 pb-0 bg-[var(--color-bg)]">
      <div
        role="tablist"
        aria-label="View"
        className="relative flex rounded-[var(--radius-sm)] bg-[var(--color-surface)] p-0.5 overflow-hidden"
      >
        {/* Sliding indicator */}
        <div
          className="scope-indicator absolute top-0.5 bottom-0.5 rounded-[var(--radius-xs)] bg-[var(--color-surface-raised)] shadow-[var(--shadow-subtle)] transition-transform duration-200"
          style={{
            width: `calc(${100 / TABS.length}% - 2px)`,
            left: "2px",
            transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 1}px))`,
          }}
        />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={currentTab === tab.id}
            onClick={() => handleClick(tab.id)}
            className={cn(
              "relative flex-1 z-10 px-2 py-1 text-[11px] font-medium rounded-[var(--radius-xs)] transition-colors duration-150 cursor-pointer",
              currentTab === tab.id
                ? "text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
