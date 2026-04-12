"use client";

import { useState } from "react";
import styles from "./export.module.scss";

interface Props {
  articleId: string;
  collectionId?: string;
}

type Format = "markdown" | "json" | "text" | "bibtex";

export function ExportPanel({ articleId, collectionId }: Props) {
  const [open, setOpen] = useState(false);

  function downloadUrl(format: Format): string {
    const params = new URLSearchParams({ format });
    if (collectionId) {
      params.set("collectionId", collectionId);
    } else {
      params.set("articleId", articleId);
    }
    return `/api/export?${params.toString()}`;
  }

  return (
    <div className={styles.export}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close export" : "Export"}
      </button>

      {open && (
        <div className={styles.options}>
          <a href={downloadUrl("markdown")} className={styles.option}>
            Markdown (.md)
          </a>
          <a href={downloadUrl("json")} className={styles.option}>
            JSON (.json)
          </a>
          <a href={downloadUrl("text")} className={styles.option}>
            Plain text (.txt)
          </a>
          <a href={downloadUrl("bibtex")} className={styles.option}>
            BibTeX (.bib)
          </a>
        </div>
      )}
    </div>
  );
}
