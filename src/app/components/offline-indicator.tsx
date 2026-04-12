"use client";

import { useSyncExternalStore } from "react";
import styles from "./offline-indicator.module.scss";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // Assume online during SSR
}

/**
 * Shows a small banner when the browser is offline.
 */
export function OfflineIndicator() {
  const online = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (online) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      You are offline — cached articles are still available
    </div>
  );
}
