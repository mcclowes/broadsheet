"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCachedArticleMeta,
  patchCachedArticleMeta,
} from "@/lib/offline-storage";
import styles from "./quick-actions.module.scss";

interface Props {
  articleId: string;
  articleUrl: string;
  initialArchived: boolean;
  initialRead: boolean;
}

export function QuickActions({
  articleId,
  articleUrl,
  initialArchived,
  initialRead,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState(initialArchived);
  const [read, setRead] = useState(initialRead);
  const [pending, startTransition] = useTransition();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 300);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function patch(body: Record<string, unknown>) {
    if (!navigator.onLine) {
      await updateCachedArticleMeta(
        articleId,
        body as { read?: boolean; archived?: boolean },
      );
      return body;
    }

    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;

    patchCachedArticleMeta(
      articleId,
      body as { read?: boolean; archived?: boolean },
    ).catch(() => {});

    return res.json();
  }

  async function toggleRead() {
    const next = !read;
    setRead(next);
    if (next) {
      window.dispatchEvent(new CustomEvent("article-marked-read"));
    }
    const result = await patch({ read: next });
    if (!result) setRead(!next);
    else startTransition(() => router.refresh());
    setOpen(false);
  }

  async function toggleArchived() {
    const next = !archived;
    setArchived(next);
    const result = await patch({ archived: next });
    if (!result) setArchived(!next);
    else startTransition(() => router.refresh());
    setOpen(false);
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setOpen(false);
  }

  return (
    <div
      className={`${styles.container} ${visible ? styles.visible : ""}`}
      aria-label="Quick actions"
    >
      {open && (
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={scrollToTop}
          >
            <span className={styles.menuIcon} aria-hidden="true">
              ↑
            </span>
            Scroll to top
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={toggleRead}
            disabled={pending}
          >
            <span className={styles.menuIcon} aria-hidden="true">
              {read ? "○" : "●"}
            </span>
            {read ? "Mark unread" : "Mark read"}
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={toggleArchived}
            disabled={pending}
          >
            <span className={styles.menuIcon} aria-hidden="true">
              {archived ? "↩" : "✓"}
            </span>
            {archived ? "Unarchive" : "Archive"}
          </button>
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.menuItem}
            onClick={() => setOpen(false)}
          >
            <span className={styles.menuIcon} aria-hidden="true">
              ↗
            </span>
            View original
          </a>
        </div>
      )}
      <button
        type="button"
        className={`${styles.fab} ${open ? styles.fabOpen : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
      >
        <span className={styles.fabIcon} aria-hidden="true">
          {open ? "×" : "⚡"}
        </span>
      </button>
    </div>
  );
}
