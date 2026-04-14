"use client";

import { useEffect, useRef } from "react";

const SCROLL_THRESHOLD = 150;
const MAX_RETRIES = 3;
// How often we're willing to PATCH progress while the user is scrolling.
// Tight enough that resume-where-you-left-off feels accurate; loose enough
// that a long scroll doesn't spam the API or the blob adapter.
const PROGRESS_PATCH_INTERVAL_MS = 3000;
// Don't persist tiny scroll twitches — at least this much of the article
// must have been read since the last patch to warrant a write.
const PROGRESS_DELTA_THRESHOLD = 0.02;

interface Props {
  articleId: string;
  alreadyRead: boolean;
}

export function ReadTracker({ articleId, alreadyRead }: Props) {
  const fired = useRef(false);
  const retries = useRef(0);
  const lastPatchAt = useRef(0);
  const lastPatchedProgress = useRef(0);
  const pendingProgress = useRef<number | null>(null);

  useEffect(() => {
    if (fired.current) return;

    const controller = new AbortController();

    function currentProgress(): number {
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return 0;
      return Math.min(1, Math.max(0, window.scrollY / docHeight));
    }

    async function patchProgress(progress: number, keepalive = false) {
      lastPatchAt.current = Date.now();
      lastPatchedProgress.current = progress;
      try {
        await fetch(`/api/articles/${articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progress }),
          keepalive,
        });
      } catch {
        // Best-effort — progress is advisory, don't surface to the user.
      }
    }

    function onExternalMark(e: Event) {
      const next = (e as CustomEvent<{ read?: boolean } | undefined>).detail
        ?.read;
      if (next === false) {
        fired.current = false;
        retries.current = 0;
        lastPatchedProgress.current = 0;
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
        controller.abort();
      } else {
        retries.current += 1;
        fired.current = false;
      }
    }

    function handleScroll() {
      const progress = currentProgress();
      pendingProgress.current = progress;

      // Completion path — keep the existing 150px heuristic so quick reads
      // still get marked read even if the page is short and progress never
      // reaches the threshold.
      if (!fired.current && !alreadyRead && window.scrollY > SCROLL_THRESHOLD) {
        markRead();
      }

      // Progress persistence — throttled. We skip until the user has
      // moved the needle AND enough time has passed since the last patch.
      const now = Date.now();
      const delta = Math.abs(progress - lastPatchedProgress.current);
      if (
        delta >= PROGRESS_DELTA_THRESHOLD &&
        now - lastPatchAt.current >= PROGRESS_PATCH_INTERVAL_MS
      ) {
        patchProgress(progress);
      }
    }

    function flushOnLeave() {
      const progress = pendingProgress.current;
      if (progress === null) return;
      if (
        Math.abs(progress - lastPatchedProgress.current) <
        PROGRESS_DELTA_THRESHOLD
      ) {
        return;
      }
      patchProgress(progress, true);
    }

    window.addEventListener("scroll", handleScroll, {
      passive: true,
      signal: controller.signal,
    });
    window.addEventListener("pagehide", flushOnLeave, {
      signal: controller.signal,
    });
    return () => {
      window.removeEventListener("article-marked-read", onExternalMark);
      controller.abort();
    };
  }, [alreadyRead, articleId]);

  return null;
}
