"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAllCachedArticles,
  type OfflineArticle,
} from "@/lib/offline-storage";
import { OfflineReader } from "../read/[id]/offline-reader";
import { parseOfflineReaderPath } from "./offline-routing";
import styles from "./offline.module.scss";

export default function OfflinePage() {
  // When the SW falls back to /offline for a /read/:id navigation, the
  // browser URL stays at /read/:id — so switch into reader mode instead
  // of showing the library list. Resolved once at mount via a lazy init
  // (window is defined here because "use client" + prerendered only runs
  // this branch in the browser).
  const [readerId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : parseOfflineReaderPath(window.location.pathname),
  );
  const [articles, setArticles] = useState<OfflineArticle[] | null>(null);

  useEffect(() => {
    if (readerId) return;
    getAllCachedArticles().then((cached) => {
      const sorted = cached.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      setArticles(sorted);
    });
  }, [readerId]);

  if (readerId) {
    return <OfflineReader articleId={readerId} />;
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.brand}>Broadsheet</h1>
        <p className={styles.notice}>You are offline</p>
      </header>

      {articles === null ? (
        <p className={styles.loading}>Loading cached articles...</p>
      ) : articles.length === 0 ? (
        <p className={styles.empty}>
          No articles cached for offline reading. Visit your library while
          online to cache articles.
        </p>
      ) : (
        <>
          <p className={styles.count}>
            {articles.length} article{articles.length === 1 ? "" : "s"}{" "}
            available offline
          </p>
          <ul className={styles.list}>
            {articles.map((a) => (
              <li key={a.id} className={styles.item}>
                <Link href={`/read/${a.id}`} className={styles.link}>
                  <h2 className={styles.title}>{a.title}</h2>
                  <div className={styles.meta}>
                    {a.source ? <span>{a.source}</span> : null}
                    <span>{a.readMinutes} min read</span>
                    {a.readAt ? (
                      <span className={styles.read}>Read</span>
                    ) : null}
                  </div>
                  {a.excerpt ? (
                    <p className={styles.excerpt}>{a.excerpt}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
