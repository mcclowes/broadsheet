"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./library.module.scss";

export function SearchBox({
  initialValue,
  buildHref,
}: {
  initialValue: string;
  buildHref: (q: string | null) => string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef(initialValue);

  function submit(next: string) {
    if (next === lastSubmittedRef.current) return;
    lastSubmittedRef.current = next;
    const href = buildHref(next.trim() === "" ? null : next.trim());
    startTransition(() => router.replace(href));
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => submit(next), 250);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    submit(value);
  }

  function onClear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValue("");
    submit("");
  }

  return (
    <form className={styles.searchBox} onSubmit={onSubmit} role="search">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        width="13"
        height="13"
        aria-hidden="true"
        className={styles.searchIcon}
      >
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="m20 20-4.5-4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Search…"
        value={value}
        onChange={onChange}
        aria-label="Search your library"
      />
      {value ? (
        <button
          type="button"
          className={styles.searchClear}
          onClick={onClear}
          aria-label="Clear search"
        >
          <svg viewBox="0 0 24 24" fill="none" width="12" height="12">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </form>
  );
}
