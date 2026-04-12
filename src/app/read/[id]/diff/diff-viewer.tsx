"use client";

import { useEffect, useState } from "react";
import styles from "./diff.module.scss";

interface DiffChange {
  added: boolean;
  removed: boolean;
  value: string;
}

interface DiffResult {
  title: string;
  savedAt: string;
  fetchedAt: string;
  hasChanges: boolean;
  changes: DiffChange[];
}

type DiffState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: DiffResult };

export function DiffViewer({ articleId }: { articleId: string }) {
  const [state, setState] = useState<DiffState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/articles/${articleId}/diff`);
      if (cancelled) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          status: "error",
          message: body.error ?? `Failed to fetch diff (${res.status})`,
        });
        return;
      }

      const result: DiffResult = await res.json();
      setState({ status: "done", result });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (state.status === "loading") {
    return (
      <p className={styles.status}>
        Re-fetching article to check for changes...
      </p>
    );
  }

  if (state.status === "error") {
    return <p className={styles.error}>{state.message}</p>;
  }

  const { result } = state;

  if (!result.hasChanges) {
    return (
      <p className={styles.status}>
        No changes detected — the article matches what you saved.
      </p>
    );
  }

  return (
    <div className={styles.diff}>
      <div className={styles.legend}>
        <span className={styles.legendRemoved}>Removed</span>
        <span className={styles.legendAdded}>Added</span>
      </div>
      <div className={styles.diffBody}>
        {result.changes.map((change, i) => {
          const lines = change.value.replace(/\n$/, "").split("\n");
          return lines.map((line, j) => (
            <div
              key={`${i}-${j}`}
              className={
                change.removed
                  ? styles.lineRemoved
                  : change.added
                    ? styles.lineAdded
                    : styles.lineContext
              }
            >
              <span className={styles.linePrefix}>
                {change.removed ? "−" : change.added ? "+" : " "}
              </span>
              <span className={styles.lineContent}>{line || "\u00A0"}</span>
            </div>
          ));
        })}
      </div>
    </div>
  );
}
