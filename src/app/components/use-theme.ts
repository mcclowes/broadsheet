"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  type Theme,
} from "@/lib/theme";

/**
 * Read and write the current theme preference.
 *
 * The server snapshot is always "system" so SSR output is stable; the
 * client snapshot reads from localStorage. Updates are driven by
 * `applyTheme`'s `THEME_CHANGE_EVENT` (same tab) and the native
 * `storage` event (other tabs).
 */
function subscribe(onStoreChange: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === THEME_STORAGE_KEY) onStoreChange();
  }
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): Theme {
  return "system";
}

export function useTheme(): readonly [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    subscribe,
    readStoredTheme,
    getServerSnapshot,
  );

  const set = useCallback((next: Theme) => {
    applyTheme(next);
  }, []);

  return [theme, set] as const;
}
