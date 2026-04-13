"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  patchCachedArticleMeta,
  updateCachedArticleMeta,
} from "@/lib/offline-storage";
import styles from "./library-item-menu.module.scss";

interface Props {
  articleId: string;
  articleUrl: string;
  initialRead: boolean;
  initialArchived: boolean;
}

export function LibraryItemMenu({
  articleId,
  articleUrl,
  initialRead,
  initialArchived,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(initialRead);
  const [archived, setArchived] = useState(initialArchived);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
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

  async function patch(body: { read?: boolean; archived?: boolean }) {
    if (!navigator.onLine) {
      await updateCachedArticleMeta(articleId, body);
      return body;
    }
    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    patchCachedArticleMeta(articleId, body).catch(() => {});
    return res.json();
  }

  async function toggleRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !read;
    setRead(next);
    setOpen(false);
    const result = await patch({ read: next });
    if (!result) {
      setRead(!next);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function toggleArchived(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((p) => !p);
        }}
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
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.item}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            View original
          </a>
        </div>
      )}
    </div>
  );
}
