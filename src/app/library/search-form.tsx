"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./search.module.scss";

interface SearchResult {
  id: string;
  title: string;
  source: string | null;
  excerpt: string | null;
  readMinutes: number;
  tags: string[];
  score: number;
}

export function SearchForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      // Clear results on next microtask to avoid sync setState in effect
      debounceRef.current = setTimeout(() => setResults(null), 0);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=20`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results);
        }
      } catch {
        // Silently fail — user can retry
      }
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className={styles.search}>
      <input
        className={styles.input}
        type="search"
        placeholder="Search articles..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search articles"
      />

      {searching && <p className={styles.status}>Searching...</p>}

      {results !== null && !searching && (
        <div className={styles.results}>
          {results.length === 0 ? (
            <p className={styles.noResults}>
              No articles found for &ldquo;{query}&rdquo;
            </p>
          ) : (
            <ul className={styles.resultList}>
              {results.map((r) => (
                <li key={r.id} className={styles.resultItem}>
                  <Link href={`/read/${r.id}`} className={styles.resultLink}>
                    <h3 className={styles.resultTitle}>{r.title}</h3>
                    <div className={styles.resultMeta}>
                      {r.source ? <span>{r.source}</span> : null}
                      <span>{r.readMinutes} min read</span>
                    </div>
                    {r.excerpt ? (
                      <p className={styles.resultExcerpt}>{r.excerpt}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
