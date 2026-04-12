"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./read.module.scss";

export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  const rafId = useRef(0);

  useEffect(() => {
    function update() {
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setProgress(0);
        return;
      }
      const pct = Math.min(1, Math.max(0, window.scrollY / docHeight));
      setProgress(pct);
    }

    function onScroll() {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  if (progress === 0) return null;

  return (
    <div
      className={styles.progressBar}
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
      style={{ transform: `scaleX(${progress})` }}
    />
  );
}
