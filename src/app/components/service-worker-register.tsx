"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount and handles updates.
 *
 * The SW calls `skipWaiting()` in its install handler and `clients.claim()`
 * in activate (see public/sw.template.js), so a freshly deployed SW takes
 * control on the next navigation. That fires `controllerchange`, and we
 * reload to drop the page state held by the old SW. The `hadController`
 * guard prevents reloading on the very first install (when there was no
 * prior SW to replace). Trade-off: one auto-reload per deploy — acceptable
 * because there's no in-flight write state to lose, and the alternative
 * (#180) was leaving users pinned to stale signed-out shells.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[sw] registration failed:", err);
    });

    // Reload once when a new SW takes over so the page uses the latest
    // cached shell.  Only reload if the page already had a controller
    // (i.e. this is an update, not the very first SW install).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  return null;
}
