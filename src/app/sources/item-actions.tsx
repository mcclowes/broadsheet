"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./sources.module.scss";

interface ItemActionsProps {
  url: string;
  initiallySaved: boolean;
}

export function ItemActions({ url, initiallySaved }: ItemActionsProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSave() {
    setError(null);
    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? `Save failed (${res.status})`);
      return;
    }
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className={styles.itemActions}>
      {saved ? (
        <button
          type="button"
          className={styles.itemSaveButton}
          disabled
          aria-label="Already saved"
        >
          Saved
        </button>
      ) : (
        <button
          type="button"
          className={styles.itemSaveButton}
          onClick={handleSave}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      )}
      <a
        className={styles.itemOriginalLink}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
      >
        Open original ↗
      </a>
      {error ? <span className={styles.itemSaveError}>{error}</span> : null}
    </div>
  );
}
