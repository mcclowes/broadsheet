"use client";

import { useEffect, useRef } from "react";

const MAX_RETRIES = 3;
// How often we're willing to PATCH progress while the user is scrolling.
// Tight enough that resume-where-you-left-off feels accurate; loose enough
// that a long scroll doesn't spam the API or the blob adapter.
const PROGRESS_PATCH_INTERVAL_MS = 3000;
// Don't persist tiny scroll twitches — at least this much of the article
// must have been read since the last patch to warrant a write.
const PROGRESS_DELTA_THRESHOLD = 0.02;
// Reaching this fraction of the article counts as finishing it → "read".
// Mirrors READ_COMPLETE_THRESHOLD in src/lib/articles.ts (the server applies
// the same cut-off when it auto-completes a progress patch). Kept local so a
// client component doesn't pull the server storage module into its bundle.
const READ_COMPLETE_THRESHOLD = 0.9;
// One-screen articles can't be scrolled, so they never accumulate progress.
// Treat them as read once they've been on screen this long.
const SHORT_ARTICLE_DWELL_MS = 4000;

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

      // Completion path — only once the reader has genuinely reached the end.
      // Partial progress is persisted below and surfaces as the "reading"
      // state; it must NOT mark the article read (that's what made a 150px
      // scroll teleport unread → read, skipping "reading" entirely).
      if (
        !fired.current &&
        !alreadyRead &&
        progress >= READ_COMPLETE_THRESHOLD
      ) {
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

    // One-screen articles never scroll, so neither the progress patch nor the
    // completion path above can fire. Mark them read after a short dwell so
    // they don't get stranded as permanently unread.
    let dwellTimer: ReturnType<typeof setTimeout> | undefined;
    function notScrollable() {
      return document.documentElement.scrollHeight - window.innerHeight <= 0;
    }
    function armShortArticleDwell() {
      if (notScrollable() && !fired.current && !alreadyRead) {
        // Re-check on fire: late-loading images can grow a "short" article into
        // a scrollable one, in which case the scroll path takes over instead.
        dwellTimer = setTimeout(() => {
          if (notScrollable()) markRead();
        }, SHORT_ARTICLE_DWELL_MS);
      }
    }
    armShortArticleDwell();
    controller.signal.addEventListener("abort", () => clearTimeout(dwellTimer));

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
