/**
 * Theme handling — light / dark / system.
 *
 * The theme is persisted in localStorage under `THEME_STORAGE_KEY` and
 * applied by setting a `data-theme` attribute on `<html>`. The "system"
 * choice removes the attribute so CSS falls back to
 * `@media (prefers-color-scheme: dark)`.
 *
 * An inline script in the root layout reads localStorage before React
 * hydrates to avoid a flash of the wrong theme. That script is the
 * minified sibling of `applyTheme` — keep them in sync if the storage
 * key or attribute name changes.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "broadsheet:theme";
export const THEME_CHANGE_EVENT = "broadsheet:theme-change";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(raw)) return raw;
  } catch {
    // localStorage unavailable (private mode, quota)
  }
  return "system";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      window.dispatchEvent(
        new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }),
      );
    }
  } catch {
    // ignore storage errors — the DOM attribute is already set
  }
}

/**
 * Inline script that runs in `<head>` before hydration to prevent a
 * flash of the wrong theme. Kept as a single-line IIFE and hand-written
 * (not built from `applyTheme`) so it stays free of module imports.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
