"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./import.module.scss";

interface ImportResult {
  itemsTotal: number;
  articlesCreated: number;
  articlesSkipped: number;
  articlesFailed: number;
  annotationsTotal: number;
  annotationsMatched: number;
  annotationsOrphaned: number;
  highlightsCreated: number;
  contentFetched: number;
  contentFailed: number;
  contentPending: number;
}

export function PocketImportForm() {
  const router = useRouter();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [annotationsFile, setAnnotationsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!csvFile) {
      setError("Please select a CSV file.");
      return;
    }
    setBusy(true);
    try {
      const csv = await csvFile.text();
      const annotations = annotationsFile
        ? await annotationsFile.text()
        : undefined;
      const res = await fetch("/api/import/pocket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, annotations }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? `Import failed (${res.status})`);
        return;
      }
      const payload = (await res.json()) as ImportResult;
      setResult(payload);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Pocket CSV (required)</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          Annotations JSON (optional)
        </span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => setAnnotationsFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </label>
      <button
        type="submit"
        className={styles.submit}
        disabled={busy || !csvFile}
      >
        {busy ? "Importing…" : "Import"}
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className={styles.result}>
          <h2>Import complete</h2>
          <ul>
            <li>
              Articles created: <strong>{result.articlesCreated}</strong>
            </li>
            <li>
              Already in library (skipped):{" "}
              <strong>{result.articlesSkipped}</strong>
            </li>
            {result.articlesFailed > 0 ? (
              <li>
                Failed: <strong>{result.articlesFailed}</strong>
              </li>
            ) : null}
            {result.articlesCreated > 0 ? (
              <li>
                Content fetched:{" "}
                <strong>{result.contentFetched}</strong>
                {result.contentFailed > 0
                  ? ` (${result.contentFailed} failed)`
                  : null}
                {result.contentPending > 0
                  ? `, ${result.contentPending} will fetch on open`
                  : null}
              </li>
            ) : null}
            {result.annotationsTotal > 0 ? (
              <>
                <li>
                  Highlights added:{" "}
                  <strong>{result.highlightsCreated}</strong>
                </li>
                {result.annotationsOrphaned > 0 ? (
                  <li>
                    Annotation groups skipped:{" "}
                    <strong>{result.annotationsOrphaned}</strong>
                  </li>
                ) : null}
              </>
            ) : null}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
