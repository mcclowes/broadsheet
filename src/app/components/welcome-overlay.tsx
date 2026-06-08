"use client";

import { useEffect, useState } from "react";
import styles from "./welcome-overlay.module.scss";

// Total wall-clock the overlay stays mounted, including the fade-out.
// Keep in sync with the timings in welcome-overlay.module.scss.
const DURATION_MS = 2600;
const REDUCED_MOTION_DURATION_MS = 900;

function formatEditionDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function WelcomeOverlay({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (!show) return;

    // Strip ?welcome=1 from the URL without a navigation, so a refresh
    // doesn't replay the animation and back/forward feels right.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("welcome")) {
        url.searchParams.delete("welcome");
        const next = url.pathname + (url.search ? url.search : "") + url.hash;
        window.history.replaceState(null, "", next);
      }
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? REDUCED_MOTION_DURATION_MS : DURATION_MS;
    const t = window.setTimeout(() => setVisible(false), ms);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!visible) return null;

  // The date may differ between SSR (server timezone) and CSR (user timezone)
  // around midnight — suppressHydrationWarning is fine here because the
  // overlay is ephemeral and the user's local date is what we want to show.
  const date = formatEditionDate(new Date());

  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-label="Welcome to Broadsheet"
    >
      <div className={styles.card}>
        <span className={styles.kicker}>Today&rsquo;s edition</span>
        <h1 className={styles.title}>Broadsheet</h1>
        <div className={styles.rules} aria-hidden="true">
          <span className={`${styles.rule} ${styles.ruleTop}`} />
          <span className={`${styles.rule} ${styles.ruleBottom}`} />
        </div>
        <p className={styles.date} suppressHydrationWarning>
          {date}
        </p>
        <p className={styles.tagline}>Your library is ready.</p>
      </div>
    </div>
  );
}
