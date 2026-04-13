"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./library.module.scss";

type Saved = { id: string; title: string };

export function SaveForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 8000);
    return () => clearTimeout(timer);
  }, [saved]);

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

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(payload.error ?? `Save failed (${res.status})`);
      return;
    }

    const article = payload.article as
      | { id?: string; title?: string }
      | undefined;
    if (article?.id) {
      setSaved({ id: article.id, title: article.title ?? "article" });
    }
    setUrl("");
    setError(null);
    setOpen(false);
    startTransition(() => router.refresh());
  }

  return (
    <>
      {!open ? (
        <button
          className={styles.addButton}
          onClick={() => setOpen(true)}
          aria-label="Add article"
        >
          +
        </button>
      ) : (
        <form className={styles.saveForm} onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className={styles.saveInput}
            type="url"
            placeholder="Paste a URL to save"
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
      )}
      {saved ? (
        <p className={styles.saveSuccess} role="status">
          Saved ·{" "}
          <Link href={`/read/${saved.id}`} className={styles.saveSuccessLink}>
            Open
          </Link>
        </p>
      ) : null}
    </>
  );
}
