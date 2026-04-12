"use client";

import { THEMES, type Theme } from "@/lib/theme";
import { useTheme } from "../components/use-theme";
import styles from "./settings.module.scss";

const LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeSettings() {
  const [theme, setTheme] = useTheme();

  return (
    <div
      className={styles.themeOptions}
      role="radiogroup"
      aria-label="Colour theme"
    >
      {THEMES.map((t) => {
        const active = t === theme;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? styles.themeOptionActive : styles.themeOption}
            onClick={() => setTheme(t)}
          >
            {LABELS[t]}
          </button>
        );
      })}
    </div>
  );
}
