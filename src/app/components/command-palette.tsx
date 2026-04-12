"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./command-palette.module.scss";

interface ArticleHit {
  id: string;
  title: string;
  source: string | null;
  excerpt: string | null;
  readMinutes: number;
  tags: string[];
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; articles: ArticleHit[] };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const articles = useMemo(
    () => (fetchState.status === "done" ? fetchState.articles : []),
    [fetchState],
  );

  // Fetch articles when palette opens
  useEffect(() => {
    if (fetchState.status !== "loading") return;
    let cancelled = false;
    fetch("/api/articles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setFetchState({
          status: "done",
          articles: data?.articles ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setFetchState({ status: "done", articles: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchState.status]);

  // Derive filtered results from query + articles
  const results = useMemo(() => {
    if (!query.trim()) return articles;
    const terms = query.toLowerCase().split(/\s+/);
    return articles.filter((a) => {
      const haystack = [
        a.title,
        a.source,
        a.excerpt,
        ...a.tags.map((t) => `#${t}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [query, articles]);

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    setActiveIndex(0);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setFetchState({ status: "idle" });
    setActiveIndex(0);
  }, []);

  const navigate = useCallback(
    (id: string) => {
      close();
      router.push(`/read/${id}`);
    },
    [close, router],
  );

  // Global keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) setFetchState({ status: "loading" });
          return !prev;
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.children[activeIndex] as
      | HTMLElement
      | undefined;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex].id);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={styles.palette}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search articles"
      >
        <div className={styles.inputRow}>
          <svg
            className={styles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="7"
              cy="7"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M11 11l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Search articles..."
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search articles"
            aria-activedescendant={
              results[activeIndex]
                ? `cmd-palette-item-${results[activeIndex].id}`
                : undefined
            }
            aria-controls="cmd-palette-list"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
          <kbd className={styles.kbd}>esc</kbd>
        </div>

        {fetchState.status === "loading" ? (
          <p className={styles.status}>Loading...</p>
        ) : results.length === 0 ? (
          <p className={styles.status}>
            {articles.length === 0
              ? "No saved articles yet."
              : "No matching articles."}
          </p>
        ) : (
          <ul
            ref={listRef}
            id="cmd-palette-list"
            className={styles.list}
            role="listbox"
          >
            {results.slice(0, 20).map((a, i) => (
              <li
                key={a.id}
                id={`cmd-palette-item-${a.id}`}
                className={i === activeIndex ? styles.itemActive : styles.item}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => navigate(a.id)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className={styles.itemTitle}>{a.title}</span>
                <span className={styles.itemMeta}>
                  {a.source ? <span>{a.source}</span> : null}
                  <span>{a.readMinutes} min</span>
                  {a.tags.slice(0, 3).map((t) => (
                    <span key={t} className={styles.itemTag}>
                      #{t}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
