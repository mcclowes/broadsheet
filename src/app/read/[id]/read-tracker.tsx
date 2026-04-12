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
      } else {
        retries.current += 1;
        fired.current = false;
      }
    }

    function handleScroll() {
      if (window.scrollY > SCROLL_THRESHOLD) {
        markRead();
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [alreadyRead, articleId]);

  return null;
}
