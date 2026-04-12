"use client";

import { useState } from "react";
import styles from "./palette-trigger.module.scss";
import { OPEN_PALETTE_EVENT } from "./command-palette";

function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac/i.test(platform);
}

export function PaletteTrigger({ className }: { className?: string }) {
  // Lazy initializer: runs once on mount. Server-renders false (→ "Ctrl") and
  // hydration may flip to "⌘" on mac; suppressHydrationWarning on the label
  // prevents the expected mismatch warning.
  const [isMac] = useState(detectIsMac);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT))}
      className={[styles.trigger, className].filter(Boolean).join(" ")}
      aria-label="Open command palette"
      title="Open command palette"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M11 11l3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <kbd className={styles.kbd} suppressHydrationWarning>
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
