"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./library-search.module.scss";

export function LibrarySearch({ listId }: { listId: string }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const emptyRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    const items = Array.from(
      list.querySelectorAll<HTMLElement>("[data-search]"),
    );
    const needle = query.trim().toLowerCase();
    let visible = 0;
    for (const item of items) {
      const haystack = (item.dataset.search ?? "").toLowerCase();
      const match = needle === "" || haystack.includes(needle);
      item.hidden = !match;
      if (match) visible += 1;
    }
    if (emptyRef.current) {
      emptyRef.current.hidden = !(needle !== "" && visible === 0);
    }
  }, [query, listId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="search"
        placeholder="Search your library…"
        aria-label="Search library"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={styles.input}
      />
      <p ref={emptyRef} className={styles.empty} hidden>
        No articles match &ldquo;{query}&rdquo;.
      </p>
    </div>
  );
}
