"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./library.module.scss";

export function SaveForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
    setError(null);
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <button
        className={styles.addButton}
        onClick={() => setOpen(true)}
        aria-label="Add article"
      >
        +
      </button>
    );
  }

  return (
    <form className={styles.saveForm} onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className={styles.saveInput}
        type="url"
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setUrl("");
            setError(null);
          }
        }}
        required
        disabled={pending}
        aria-label="Article URL"
      />
      <button
        className={styles.saveButton}
        type="submit"
        disabled={pending || !url.trim()}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {error ? (
        <p className={styles.saveError} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
