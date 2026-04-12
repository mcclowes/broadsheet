"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCachedArticle, type OfflineArticle } from "@/lib/offline-storage";
import styles from "./read.module.scss";

/**
 * Fallback reader that loads an article from IndexedDB when the server-side
 * page isn't available (offline). Rendered only when JavaScript detects
 * we're offline and have the article cached.
 */
export function OfflineReader({ articleId }: { articleId: string }) {
  const [article, setArticle] = useState<OfflineArticle | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getCachedArticle(articleId).then((cached) => {
      if (cached) {
        setArticle(cached);
      } else {
        setNotFound(true);
      }
    });
  }, [articleId]);

  if (notFound) {
    return (
      <main className={styles.main}>
        <nav className={styles.nav}>
          <Link href="/offline" className={styles.back}>
            ← Offline library
          </Link>
        </nav>
        <p>This article is not available offline.</p>
      </main>
    );
  }

  if (!article) {
    return (
      <main className={styles.main}>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <nav className={styles.nav}>
        <Link href="/offline" className={styles.back}>
          ← Offline library
        </Link>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>{article.title}</h1>
        <div className={styles.meta}>
          {article.byline ? <span>{article.byline}</span> : null}
          {article.source ? <span>{article.source}</span> : null}
          <span>{article.readMinutes} min read</span>
        </div>
      </header>

      <article
        className="reader-body"
        dangerouslySetInnerHTML={{ __html: article.body }}
      />
    </main>
  );
}
