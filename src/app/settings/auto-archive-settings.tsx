"use client";

import { useEffect, useState, useTransition } from "react";
import styles from "./settings.module.scss";

type AutoArchiveDays = null | 14 | 30 | 90 | 180;

interface AutoArchivePreferences {
  unreadAfterDays: AutoArchiveDays;
  readAfterDays: AutoArchiveDays;
  updatedAt: string | null;
}

const OPTIONS: ReadonlyArray<{ value: AutoArchiveDays; label: string }> = [
  { value: null, label: "Never" },
  { value: 14, label: "After 2 weeks" },
  { value: 30, label: "After 1 month" },
  { value: 90, label: "After 3 months" },
  { value: 180, label: "After 6 months" },
];

// Form values are strings; encode null as "never".
function encode(v: AutoArchiveDays): string {
  return v === null ? "never" : String(v);
}
function decode(v: string): AutoArchiveDays {
  if (v === "never") return null;
  const n = Number(v);
  if (n === 14 || n === 30 || n === 90 || n === 180) return n;
  return null;
}

export function AutoArchiveSettings() {
  const [prefs, setPrefs] = useState<AutoArchivePreferences | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/auto-archive")
      .then((r) => r.json())
      .then((data) => {
        setPrefs(data.preferences);
        setLoaded(true);
      })
      .catch(() => {
        setError("Couldn’t load auto-archive preferences.");
        setLoaded(true);
      });
  }, []);

  function update(patch: Partial<AutoArchivePreferences>) {
    if (!prefs) return;
    const next: AutoArchivePreferences = { ...prefs, ...patch };
    setPrefs(next);
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/settings/auto-archive", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unreadAfterDays: next.unreadAfterDays,
          readAfterDays: next.readAfterDays,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "Failed to update auto-archive");
        return;
      }
      const data = await res.json();
      setPrefs(data.preferences);
    });
  }

  if (!loaded) return <p className={styles.muted}>Loading…</p>;
  if (!prefs) {
    return (
      <p className={styles.error} role="alert">
        {error ?? "Couldn’t load auto-archive preferences."}
      </p>
    );
  }

  return (
    <div className={styles.autoArchive}>
      <div className={styles.autoArchiveRule}>
        <label
          htmlFor="auto-archive-unread"
          className={styles.autoArchiveLabel}
        >
          Unread articles
        </label>
        <select
          id="auto-archive-unread"
          className={styles.autoArchiveSelect}
          value={encode(prefs.unreadAfterDays)}
          disabled={pending}
          onChange={(e) => update({ unreadAfterDays: decode(e.target.value) })}
        >
          {OPTIONS.map((o) => (
            <option key={encode(o.value)} value={encode(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <p className={styles.autoArchiveHint}>
          Measured from the date you saved the article.
        </p>
      </div>

      <div className={styles.autoArchiveRule}>
        <label htmlFor="auto-archive-read" className={styles.autoArchiveLabel}>
          Read articles
        </label>
        <select
          id="auto-archive-read"
          className={styles.autoArchiveSelect}
          value={encode(prefs.readAfterDays)}
          disabled={pending}
          onChange={(e) => update({ readAfterDays: decode(e.target.value) })}
        >
          {OPTIONS.map((o) => (
            <option key={encode(o.value)} value={encode(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <p className={styles.autoArchiveHint}>
          Measured from the date you marked it as read.
        </p>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
