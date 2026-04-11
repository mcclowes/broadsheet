"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./library.module.scss";

export function SaveForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) return;

    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? `Save failed (${res.status})`);
      return;
    }

    setUrl("");
    startTransition(() => router.refresh());
  }

  return (
    <form className={styles.saveForm} onSubmit={handleSubmit}>
      <input
        className={styles.saveInput}
        type="url"
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
        disabled={pending}
        aria-label="Article URL"
      />
      <button className={styles.saveButton} type="submit" disabled={pending || !url.trim()}>
        {pending ? "Saving…" : "Save"}
      </button>
      {error ? <p className={styles.saveError}>{error}</p> : null}
    </form>
  );
}
