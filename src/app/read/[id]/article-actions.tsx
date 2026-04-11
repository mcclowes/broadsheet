"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./read.module.scss";

interface Props {
  articleId: string;
  initialTags: string[];
  initialArchived: boolean;
  initialRead: boolean;
}

export function ArticleActions({
  articleId,
  initialTags,
  initialArchived,
  initialRead,
}: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [archived, setArchived] = useState(initialArchived);
  const [read, setRead] = useState(initialRead);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
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

  async function toggleArchived() {
    const next = !archived;
    setArchived(next);
    const result = await patch({ archived: next });
    if (!result) setArchived(!next);
    else startTransition(() => router.refresh());
  }

  async function toggleRead() {
    const next = !read;
    setRead(next);
    const result = await patch({ read: next });
    if (!result) setRead(!next);
    else startTransition(() => router.refresh());
  }

  return (
    <div className={styles.actions}>
      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.actionButton}
          onClick={toggleRead}
          disabled={pending}
        >
          {read ? "Mark unread" : "Mark read"}
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={toggleArchived}
          disabled={pending}
        >
          {archived ? "Unarchive" : "Archive"}
        </button>
      </div>

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
            placeholder="+ tag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            maxLength={32}
          />
        </form>
      </div>

      {error ? <p className={styles.actionError}>{error}</p> : null}
    </div>
  );
}
