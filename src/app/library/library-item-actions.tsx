"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./library-item-actions.module.scss";

interface Props {
  articleId: string;
  articleUrl: string;
  initialRead: boolean;
  initialArchived: boolean;
}

type Patch = { read?: boolean; archived?: boolean };

async function patch(articleId: string, body: Patch): Promise<Patch | null> {
  const res = await fetch(`/api/articles/${articleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export function LibraryItemActions({
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

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function toggleRead(e: React.MouseEvent) {
    stop(e);
    const next = !read;
    setRead(next);
    setOpen(false);
    const result = await patch(articleId, { read: next });
    if (!result) {
      setRead(!next);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function toggleArchived(e: React.MouseEvent) {
    stop(e);
    const next = !archived;
    setArchived(next);
    setOpen(false);
    const result = await patch(articleId, { archived: next });
    if (!result) setArchived(!next);
    else startTransition(() => router.refresh());
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={read ? styles.iconButtonActive : styles.iconButton}
        aria-label={read ? "Mark unread" : "Mark as read"}
        aria-pressed={read}
        onClick={toggleRead}
        disabled={pending}
      >
        <CheckIcon />
      </button>
      <button
        type="button"
        className={archived ? styles.iconButtonActive : styles.iconButton}
        aria-label={archived ? "Unarchive" : "Archive"}
        aria-pressed={archived}
        onClick={toggleArchived}
        disabled={pending}
      >
        <ArchiveIcon />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Article actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          setOpen((p) => !p);
        }}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.menuItem}
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

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
    >
      <path
        d="M3 8.5l3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
    >
      <rect
        x="2"
        y="3"
        width="12"
        height="3"
        rx="0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3 6v6.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 8.5h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
      focusable="false"
    >
      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="13" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}
