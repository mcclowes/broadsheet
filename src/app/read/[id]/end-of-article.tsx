"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./end-of-article.module.scss";

export interface NextSuggestion {
  id: string;
  title: string;
  url: string;
  source: string | null;
  readMinutes: number;
}

interface Props {
  articleId: string;
  backHref: string;
  initialArchived: boolean;
  next: NextSuggestion | null;
}

/**
 * Shown at the foot of an article so the reader has somewhere to go without
 * scrolling back up to the menu (issue #198): a route back to the library, an
 * inline archive toggle, and — when one is relevant — a suggested next read.
 */
export function EndOfArticle({
  articleId,
  backHref,
  initialArchived,
  next,
}: Props) {
  const router = useRouter();
  const [archived, setArchived] = useState(initialArchived);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  async function toggleArchive() {
    const nextState = !archived;
    setArchived(nextState);
    setError(false);
    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: nextState }),
    });
    if (!res.ok) {
      setArchived(!nextState);
      setError(true);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className={styles.container} aria-label="What next">
      <div className={styles.rule} aria-hidden="true" />
      <p className={styles.eyebrow}>You&rsquo;ve reached the end</p>

      <div className={styles.actions}>
        <Link href={backHref} className={styles.primary}>
          ← Back to library
        </Link>
        <button
          type="button"
          className={styles.secondary}
          onClick={toggleArchive}
          disabled={pending}
        >
          {archived ? "Archived ✓" : "Archive"}
        </button>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          Couldn&rsquo;t update. Try again.
        </p>
      ) : null}

      {next ? (
        <Link href={`/read/${next.id}`} className={styles.next}>
          <span className={styles.nextLabel}>Read next</span>
          <span className={styles.nextTitle}>{next.title}</span>
          <span className={styles.nextMeta}>
            <PublicationIcon url={next.url} size={16} />
            {next.source ? <span>{next.source}</span> : null}
            <span>{next.readMinutes} min read</span>
          </span>
        </Link>
      ) : null}
    </section>
  );
}
