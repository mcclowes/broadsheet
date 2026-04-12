"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./read.module.scss";

/**
 * Sticky nav bar that hides on scroll-down and reappears on scroll-up.
 * Always visible when near the top of the page.
 */
export function ScrollNav({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      // Always show when near the top
      if (y < 60) {
        setVisible(true);
      } else if (y < lastY.current) {
        // Scrolling up
        setVisible(true);
      } else if (y > lastY.current) {
        // Scrolling down
        setVisible(false);
      }
      lastY.current = y;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`${styles.stickyNav} ${visible ? styles.stickyNavVisible : styles.stickyNavHidden}`}
    >
      {children}
    </div>
  );
}
