"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./library.module.scss";

interface ImportResponse {
  format: string;
  imported: number;
  skipped: number;
  total: number;
  error?: string;
}

export function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = pending || uploading;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Import failed (${res.status})`);
        return;
      }

      setResult(data);
      startTransition(() => router.refresh());
    } catch {
      setError("Network error — could not upload file");
    } finally {
      setUploading(false);
      // Reset the file input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={styles.importSection}>
      <label className={styles.importButton} aria-disabled={busy}>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.csv,.json"
          onChange={handleFile}
          disabled={busy}
          hidden
        />
        {busy ? "Importing…" : "Import"}
      </label>
      <span className={styles.importHint}>Pocket, Instapaper, or Omnivore</span>
      {error ? <p className={styles.importError}>{error}</p> : null}
      {result ? (
        <p className={styles.importResult}>
          Imported {result.imported} article{result.imported !== 1 ? "s" : ""}
          {result.skipped > 0
            ? ` (${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""} skipped)`
            : ""}
          {" from "}
          {result.format === "pocket"
            ? "Pocket"
            : result.format === "instapaper"
              ? "Instapaper"
              : "Omnivore"}
          .
        </p>
      ) : null}
    </div>
  );
}
