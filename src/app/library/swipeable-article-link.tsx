"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  updateCachedArticleMeta,
  patchCachedArticleMeta,
} from "@/lib/offline-storage";
import {
  isHorizontalSwipe,
  shouldCommitSwipe,
  SWIPE_START_PX,
} from "./swipe-gesture";
import styles from "./swipeable-article-link.module.scss";

interface Props {
  articleId: string;
  href: string;
  initialRead: boolean;
  linkClassName?: string;
  children: ReactNode;
}

export function SwipeableArticleLink({
  articleId,
  href,
  initialRead,
  linkClassName,
  children,
}: Props) {
  const router = useRouter();
  const [read, setRead] = useState(initialRead);
  const [offset, setOffset] = useState(0);
  const [, startTransition] = useTransition();

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const swiping = useRef(false);
  const committedRef = useRef(false);

  function reset() {
    tracking.current = false;
    swiping.current = false;
    setOffset(0);
  }

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    tracking.current = true;
    swiping.current = false;
    committedRef.current = false;
  }

  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!tracking.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;

    if (!swiping.current) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_START_PX) {
        // Vertical scroll — bail.
        tracking.current = false;
        return;
      }
      if (!isHorizontalSwipe(dx, dy)) return;
      swiping.current = true;
    }
    setOffset(dx);
  }

  async function commitToggle() {
    const next = !read;
    setRead(next);
    if (next) window.dispatchEvent(new CustomEvent("article-marked-read"));

    try {
      if (!navigator.onLine) {
        await updateCachedArticleMeta(articleId, { read: next });
      } else {
        const res = await fetch(`/api/articles/${articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: next }),
        });
        if (!res.ok) {
          setRead(!next);
          return;
        }
        patchCachedArticleMeta(articleId, { read: next }).catch(() => {});
      }
      startTransition(() => router.refresh());
    } catch {
      setRead(!next);
    }
  }

  function onTouchEnd() {
    if (!tracking.current) return;
    const dx = offset;
    const didSwipe = swiping.current;
    reset();
    if (didSwipe && shouldCommitSwipe(dx)) {
      committedRef.current = true;
      void commitToggle();
    }
  }

  function onTouchCancel() {
    reset();
  }

  function onClickCapture(e: React.MouseEvent) {
    // If the user just completed a swipe, swallow the click so we don't navigate.
    if (committedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      committedRef.current = false;
    }
  }

  const active = offset !== 0;
  const direction = offset > 0 ? "right" : offset < 0 ? "left" : null;
  const willCommit = active && shouldCommitSwipe(offset);
  const label = read ? "Mark unread" : "Mark read";

  return (
    <div
      className={styles.wrapper}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {active ? (
        <div
          className={styles.action}
          data-direction={direction}
          data-commit={willCommit ? "true" : "false"}
          aria-hidden="true"
        >
          <span>{label}</span>
        </div>
      ) : null}
      <div
        className={styles.foreground}
        style={{
          transform: active ? `translate3d(${offset}px, 0, 0)` : undefined,
          transition: active ? "none" : undefined,
        }}
      >
        <Link
          href={href}
          className={linkClassName ?? styles.link}
          onClickCapture={onClickCapture}
        >
          {children}
        </Link>
      </div>
    </div>
  );
}
