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

    async function markRead() {
      if (fired.current || retries.current >= MAX_RETRIES) return;
      fired.current = true;

      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });

      if (res.ok) {
        window.dispatchEvent(new CustomEvent("article-marked-read"));
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
    return () => controller.abort();
  }, [alreadyRead, articleId]);

  return null;
}
