"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCachedArticleMeta,
  patchCachedArticleMeta,
} from "@/lib/offline-storage";
import styles from "./read.module.scss";

interface Props {
  articleId: string;
  initialTags: string[];
}

export function ArticleActions({ articleId, initialTags }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);

    // If offline, queue the change for later sync
    if (!navigator.onLine) {
      await updateCachedArticleMeta(
        articleId,
        body as {
          read?: boolean;
          archived?: boolean;
          tags?: string[];
        },
      );
      return body;
    }

    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? `Request failed (${res.status})`);
      return null;
    }

    // Update the local cache (no sync entry needed — server already has it)
    patchCachedArticleMeta(
      articleId,
      body as {
        read?: boolean;
        archived?: boolean;
        tags?: string[];
      },
    ).catch(() => {});

    return res.json();
  }

  async function commitTags(next: string[]) {
    const prev = tags;
    setTags(next);
    const result = await patch({ tags: next });
    if (!result) {
      setTags(prev);
      return;
    }
    if (Array.isArray(result.tags)) setTags(result.tags);
    startTransition(() => router.refresh());
  }

  async function addTag(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = draft.trim();
    if (!value) return;
    if (tags.includes(value.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    await commitTags([...tags, value]);
  }

  async function removeTag(tag: string) {
    await commitTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className={styles.actions}>
      <div className={styles.tagRow}>
        {tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button
              type="button"
              className={styles.tagRemove}
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              disabled={pending}
            >
              ×
            </button>
          </span>
        ))}
        <form onSubmit={addTag} className={styles.tagForm}>
          <input
            className={styles.tagInput}
            placeholder="Add a tag…"
            aria-label="Add a tag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            maxLength={32}
          />
        </form>
      </div>

      {error ? (
        <p className={styles.actionError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
