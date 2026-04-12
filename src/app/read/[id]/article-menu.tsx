"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateCachedArticleMeta,
  patchCachedArticleMeta,
} from "@/lib/offline-storage";
import styles from "./article-menu.module.scss";

interface Props {
  articleId: string;
  articleUrl: string;
  initialArchived: boolean;
  initialRead: boolean;
}

export function ArticleMenu({
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onAutoRead() {
      setRead(true);
    }
    window.addEventListener("article-marked-read", onAutoRead);
    return () => window.removeEventListener("article-marked-read", onAutoRead);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
    setOpen(false);
    if (next) window.dispatchEvent(new CustomEvent("article-marked-read"));
    const result = await patch({ read: next });
    if (!result) setRead(!next);
    else startTransition(() => router.refresh());
  }

  async function toggleArchived() {
    const next = !archived;
    setArchived(next);
    setOpen(false);
    const result = await patch({ archived: next });
    if (!result) setArchived(!next);
    else startTransition(() => router.refresh());
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Article actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((p) => !p)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.item}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span>View original</span>
            <svg
              className={styles.itemIcon}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M4 2h6v6M10 2L5 7M8 8v2H2V4h2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <Link
            href={`/read/${articleId}/diff`}
            className={styles.item}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Check for changes
          </Link>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={toggleRead}
            disabled={pending}
          >
            {read ? "Mark unread" : "Mark as read"}
          </button>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={toggleArchived}
            disabled={pending}
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      )}
    </div>
  );
}
