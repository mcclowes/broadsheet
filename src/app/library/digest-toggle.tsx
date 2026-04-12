"use client";

import { useEffect, useState, useTransition } from "react";
import styles from "./library.module.scss";

interface DigestPreferences {
  enabled: boolean;
  email: string;
  enabledAt: string | null;
}

export function DigestToggle() {
  const [prefs, setPrefs] = useState<DigestPreferences | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/digest/preferences")
      .then((r) => r.json())
      .then((data) => setPrefs(data.preferences))
      .catch(() => {
        // Silently fail — the toggle just won't show
      });
  }, []);

  if (!prefs) return null;

  function handleToggle() {
    setError(null);
    const next = !prefs!.enabled;

    startTransition(async () => {
      const res = await fetch("/api/digest/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "Failed to update digest preference");
        return;
      }

      const data = await res.json();
      setPrefs(data.preferences);
    });
  }

  return (
    <div className={styles.digestToggle}>
      <button
        type="button"
        className={
          prefs.enabled ? styles.digestButtonActive : styles.digestButton
        }
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={prefs.enabled}
      >
        {pending
          ? "Updating…"
          : prefs.enabled
            ? "Daily digest on"
            : "Daily digest off"}
      </button>
      {prefs.enabled && prefs.email ? (
        <span className={styles.digestEmail}>{prefs.email}</span>
      ) : null}
      {error ? (
        <span className={styles.digestError} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
