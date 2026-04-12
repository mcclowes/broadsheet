"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount and handles updates.
 *
 * When a new SW activates (skipWaiting + clients.claim), the
 * `controllerchange` event fires.  We reload so the page picks up the
 * new app shell — but only if there was already a controller, to avoid
 * reloading on the very first install.
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
