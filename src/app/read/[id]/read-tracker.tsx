"use client";

import { useEffect, useRef } from "react";

const SCROLL_THRESHOLD = 150;
const MAX_RETRIES = 3;

interface Props {
  articleId: string;
  alreadyRead: boolean;
}

export function ReadTracker({ articleId, alreadyRead }: Props) {
  const fired = useRef(false);
  const retries = useRef(0);

  useEffect(() => {
    if (alreadyRead || fired.current) return;

    const controller = new AbortController();

    function onExternalMark(e: Event) {
      const next = (e as CustomEvent<{ read?: boolean } | undefined>).detail
        ?.read;
      // Event without detail (legacy) or marking read — stop the scroll
      // handler. If the event says the article was marked *unread*, leave
      // our scroll handler active so a further scroll can mark it read again.
      if (next === false) {
        fired.current = false;
        retries.current = 0;
        return;
      }
      fired.current = true;
      controller.abort();
    }
    window.addEventListener("article-marked-read", onExternalMark);

    async function markRead() {
      if (fired.current || retries.current >= MAX_RETRIES) return;
      fired.current = true;

      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });

      if (res.ok) {
        window.dispatchEvent(
          new CustomEvent("article-marked-read", { detail: { read: true } }),
        );
        // Remove listener once successfully marked — no need to keep firing
        controller.abort();
      } else {
        retries.current += 1;
        fired.current = false;
      }
    }

    function handleScroll() {
      if (fired.current) return;
      if (window.scrollY > SCROLL_THRESHOLD) {
        markRead();
      }
    }

    window.addEventListener("scroll", handleScroll, {
      passive: true,
      signal: controller.signal,
    });
    return () => {
      window.removeEventListener("article-marked-read", onExternalMark);
      controller.abort();
    };
  }, [alreadyRead, articleId]);

  return null;
}
