"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount. Renders nothing.
 * Placed in the root layout so it runs on every page.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed:", err);
    });
  }, []);

  return null;
}
