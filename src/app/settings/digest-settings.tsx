"use client";

import { useEffect, useState, useTransition } from "react";
import styles from "./settings.module.scss";

interface DigestPreferences {
  enabled: boolean;
  email: string;
  enabledAt: string | null;
}

export function DigestSettings() {
  const [prefs, setPrefs] = useState<DigestPreferences | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/digest/preferences")
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data.preferences);
        setLoaded(true);
      })
      .catch(() => {
        setError("Couldn’t load digest preferences.");
        setLoaded(true);
      });
  }, []);

  function handleToggle() {
    if (!prefs) return;
    setError(null);
    const next = !prefs.enabled;

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

  if (!loaded) {
    return <p className={styles.muted}>Loading…</p>;
  }

  if (!prefs) {
    return (
      <p className={styles.error} role="alert">
        {error ?? "Couldn’t load digest preferences."}
      </p>
    );
  }

  return (
    <div className={styles.digestRow}>
      <div className={styles.digestStatus}>
        <span className={styles.digestLabel}>
          {prefs.enabled ? "On" : "Off"}
        </span>
        {prefs.enabled && prefs.email ? (
          <span className={styles.digestEmail}>Sends to {prefs.email}</span>
        ) : null}
      </div>
      <button
        type="button"
        className={
          prefs.enabled ? styles.digestButtonActive : styles.digestButton
        }
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={prefs.enabled}
      >
        {pending ? "Updating…" : prefs.enabled ? "Turn off" : "Turn on"}
      </button>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
