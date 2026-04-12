"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./shared.module.scss";

/** Try to extract a URL from the share target params. Browsers sometimes put
 *  the URL in `text` rather than `url` (e.g. Android Chrome). */
function extractUrl(params: URLSearchParams): string | null {
  const explicit = params.get("url")?.trim();
  if (explicit && URL.canParse(explicit)) return explicit;

  const text = params.get("text")?.trim();
  if (!text) return null;

  // The shared text may contain a bare URL or a URL amongst prose.
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : null;
}

type Phase = "saving" | "saved" | "error";

export default function SharedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const didRun = useRef(false);

  const url = extractUrl(searchParams);

  const [phase, setPhase] = useState<Phase>(url ? "saving" : "error");
  const [articleId, setArticleId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    url ? null : "No URL found in the shared content.",
  );

  useEffect(() => {
    if (!url || didRun.current) return;
    didRun.current = true;

    (async () => {
      try {
        const res = await fetch("/api/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setPhase("error");
          setErrorMsg(payload.error ?? `Save failed (${res.status})`);
          return;
        }

        const { article } = await res.json();
        setArticleId(article.id);
        setPhase("saved");

        // Auto-navigate to the article after a brief pause so the user
        // sees the success state.
        setTimeout(() => router.replace(`/read/${article.id}`), 1200);
      } catch {
        setPhase("error");
        setErrorMsg("Network error — are you online?");
      }
    })();
  }, [url, router]);

  return (
    <main className={styles.main}>
      <h1 className={styles.brand}>Broadsheet</h1>

      {phase === "saving" && (
        <div className={styles.status}>
          <p className={styles.message}>Saving article&hellip;</p>
          {url && <p className={styles.url}>{url}</p>}
        </div>
      )}

      {phase === "saved" && (
        <div className={styles.status}>
          <p className={styles.message}>Saved</p>
          {articleId && (
            <Link href={`/read/${articleId}`} className={styles.link}>
              Read now
            </Link>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className={styles.status}>
          <p className={styles.error}>{errorMsg}</p>
          <Link href="/library" className={styles.link}>
            Go to library
          </Link>
        </div>
      )}
    </main>
  );
}
