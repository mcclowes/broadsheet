"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { applyTheme } from "@/lib/theme";
import styles from "./command-palette.module.scss";

interface ArticleHit {
  id: string;
  title: string;
  source: string | null;
  excerpt: string | null;
  readMinutes: number;
  tags: string[];
}

type ArticleCacheState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; articles: ArticleHit[]; fetchedAt: number }
  | { status: "error" };

const CACHE_STALE_MS = 60_000;
const RECENTS_KEY = "broadsheet:palette:recents";
const RECENTS_MAX = 5;

export const OPEN_PALETTE_EVENT = "broadsheet:open-palette";

type StaticCommand = {
  id: string;
  label: string;
  hint?: string;
  run: (router: ReturnType<typeof useRouter>) => void;
};

const STATIC_COMMANDS: StaticCommand[] = [
  {
    id: "go-inbox",
    label: "Go to inbox",
    hint: "/library",
    run: (r) => r.push("/library"),
  },
  {
    id: "go-unread",
    label: "Go to unread",
    hint: "/library?state=unread",
    run: (r) => r.push("/library?state=unread"),
  },
  {
    id: "go-read",
    label: "Go to read",
    hint: "/library?state=read",
    run: (r) => r.push("/library?state=read"),
  },
  {
    id: "go-archive",
    label: "Go to archive",
    hint: "/library?view=archive",
    run: (r) => r.push("/library?view=archive"),
  },
  {
    id: "go-sources",
    label: "Go to sources",
    hint: "/sources",
    run: (r) => r.push("/sources"),
  },
  {
    id: "go-settings",
    label: "Go to settings",
    hint: "/settings",
    run: (r) => r.push("/settings"),
  },
  {
    id: "go-home",
    label: "Go to today's edition",
    hint: "/",
    run: (r) => r.push("/"),
  },
  {
    id: "theme-system",
    label: "Theme: system",
    hint: "Follow OS preference",
    run: () => applyTheme("system"),
  },
  {
    id: "theme-light",
    label: "Theme: light",
    hint: "Force light mode",
    run: () => applyTheme("light"),
  },
  {
    id: "theme-dark",
    label: "Theme: dark",
    hint: "Force dark mode",
    run: () => applyTheme("dark"),
  },
];

type Item =
  | {
      kind: "command";
      id: string;
      label: string;
      hint?: string;
      onSelect: () => void;
    }
  | {
      kind: "tag";
      id: string;
      tag: string;
      count: number;
      onSelect: () => void;
    }
  | { kind: "article"; id: string; article: ArticleHit; onSelect: () => void }
  | { kind: "save-url"; id: string; url: string; onSelect: () => void };

type Group = { heading: string; items: Item[] };

function looksLikeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    // Require a dot in hostname so "react" isn't treated as a URL.
    if (!/\./.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

// Simple subsequence + substring fuzzy scorer. Higher is better; 0 = no match.
function fuzzyScore(haystack: string, needle: string): number {
  if (!needle) return 1;
  const hay = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const idx = hay.indexOf(n);
  if (idx >= 0) return 100 - idx; // prefer earlier substring matches
  // char-by-char subsequence
  let hi = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const ch = n[ni];
    const found = hay.indexOf(ch, hi);
    if (found < 0) return 0;
    hi = found + 1;
  }
  return 1;
}

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .slice(0, RECENTS_MAX);
  } catch {
    return [];
  }
}

function pushRecent(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const cur = loadRecents().filter((x) => x !== id);
    cur.unshift(id);
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(cur.slice(0, RECENTS_MAX)),
    );
  } catch {
    // ignore quota / private mode
  }
}

function flatten(groups: Group[]): Item[] {
  return groups.flatMap((g) => g.items);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cache, setCache] = useState<ArticleCacheState>({ status: "idle" });
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const articles = useMemo(
    () => (cache.status === "loaded" ? cache.articles : []),
    [cache],
  );

  const ensureLoaded = useCallback(() => {
    setCache((prev) => {
      if (prev.status === "loading") return prev;
      if (
        prev.status === "loaded" &&
        Date.now() - prev.fetchedAt < CACHE_STALE_MS
      ) {
        return prev;
      }
      return { status: "loading" };
    });
  }, []);

  // Fetch when we transition into loading state
  useEffect(() => {
    if (cache.status !== "loading") return;
    let cancelled = false;
    fetch("/api/articles")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list = (data?.articles ?? []) as ArticleHit[];
        setCache({ status: "loaded", articles: list, fetchedAt: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setCache({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [cache.status]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setRecents(loadRecents());
    ensureLoaded();
  }, [ensureLoaded]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setSaveError(null);
  }, []);

  // Global keyboard shortcut — Cmd/Ctrl+K toggles. Meta/Ctrl+K doesn't collide
  // with typing, so no text-input scope guard is needed.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) {
            setRecents(loadRecents());
            ensureLoaded();
          } else {
            setQuery("");
            setActiveIndex(0);
            setSaveError(null);
          }
          return !prev;
        });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ensureLoaded]);

  // External trigger via custom event (for masthead button etc.)
  useEffect(() => {
    function onOpen() {
      openPalette();
    }
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, [openPalette]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const saveUrl = useCallback(
    async (url: string) => {
      if (saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch("/api/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          setSaveError(payload.error ?? `Save failed (${res.status})`);
          return;
        }
        const data: { article?: { id: string } } = await res.json();
        // Invalidate cache so the new article shows up next open
        setCache({ status: "idle" });
        close();
        if (data.article?.id) {
          pushRecent(data.article.id);
          router.push(`/read/${data.article.id}`);
        } else {
          router.push("/library");
        }
      } catch {
        setSaveError("Network error. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [close, router, saving],
  );

  // Derived groups
  const groups = useMemo<Group[]>(() => {
    const raw = query.trim();
    const isCommandMode = raw.startsWith(">");
    const isTagMode = raw.startsWith("#");
    const needle = isCommandMode || isTagMode ? raw.slice(1).trim() : raw;

    // Tag mode: only tags
    if (isTagMode) {
      const tagCounts = new Map<string, number>();
      for (const a of articles)
        for (const t of a.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      const tags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({
          tag,
          count,
          score: fuzzyScore(tag, needle),
        }))
        .filter((t) => t.score > 0)
        .sort((a, b) => b.score - a.score || b.count - a.count)
        .slice(0, 30)
        .map<Item>((t) => ({
          kind: "tag",
          id: `tag-${t.tag}`,
          tag: t.tag,
          count: t.count,
          onSelect: () => {
            close();
            router.push(`/library?tag=${encodeURIComponent(t.tag)}`);
          },
        }));
      return [{ heading: "Tags", items: tags }];
    }

    // Command mode: only commands
    if (isCommandMode) {
      const cmds = STATIC_COMMANDS.map((c) => ({
        c,
        score: fuzzyScore(`${c.label} ${c.hint ?? ""}`, needle),
      }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map<Item>(({ c }) => ({
          kind: "command",
          id: c.id,
          label: c.label,
          hint: c.hint,
          onSelect: () => {
            close();
            c.run(router);
          },
        }));
      return [{ heading: "Commands", items: cmds }];
    }

    const result: Group[] = [];

    // Save-URL top row when query looks like a URL
    const url = looksLikeUrl(raw);
    if (url) {
      result.push({
        heading: "Actions",
        items: [
          {
            kind: "save-url",
            id: "save-url",
            url,
            onSelect: () => void saveUrl(url),
          },
        ],
      });
    }

    // Empty query: recents at top, then commands, then all articles
    if (!needle) {
      const byId = new Map(articles.map((a) => [a.id, a]));
      const recentItems = recents
        .map((id) => byId.get(id))
        .filter((a): a is ArticleHit => Boolean(a))
        .map<Item>((a) => ({
          kind: "article",
          id: `recent-${a.id}`,
          article: a,
          onSelect: () => {
            close();
            pushRecent(a.id);
            router.push(`/read/${a.id}`);
          },
        }));
      if (recentItems.length > 0)
        result.push({ heading: "Recent", items: recentItems });

      result.push({
        heading: "Commands",
        items: STATIC_COMMANDS.slice(0, 4).map<Item>((c) => ({
          kind: "command",
          id: c.id,
          label: c.label,
          hint: c.hint,
          onSelect: () => {
            close();
            c.run(router);
          },
        })),
      });

      result.push({
        heading: "Articles",
        items: articles.slice(0, 20).map<Item>((a) => ({
          kind: "article",
          id: a.id,
          article: a,
          onSelect: () => {
            close();
            pushRecent(a.id);
            router.push(`/read/${a.id}`);
          },
        })),
      });
      return result;
    }

    // Query present: match articles fuzzily across title/source/excerpt/tags;
    // also surface any matching commands.
    const terms = needle.toLowerCase().split(/\s+/).filter(Boolean);
    const scoredArticles = articles
      .map((a) => {
        const hay = [
          a.title,
          a.source ?? "",
          a.excerpt ?? "",
          ...a.tags.map((t) => `#${t}`),
        ]
          .join(" ")
          .toLowerCase();
        if (!terms.every((t) => hay.includes(t) || fuzzyScore(hay, t) > 0)) {
          return { a, score: 0 };
        }
        // score by the strongest term match on the title
        const titleScore = terms
          .map((t) => fuzzyScore(a.title, t))
          .reduce((x, y) => x + y, 0);
        return { a, score: titleScore + 1 };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .slice(0, 20)
      .map<Item>(({ a }) => ({
        kind: "article",
        id: a.id,
        article: a,
        onSelect: () => {
          close();
          pushRecent(a.id);
          router.push(`/read/${a.id}`);
        },
      }));

    const scoredCommands = STATIC_COMMANDS.map((c) => ({
      c,
      score: fuzzyScore(`${c.label} ${c.hint ?? ""}`, needle),
    }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map<Item>(({ c }) => ({
        kind: "command",
        id: c.id,
        label: c.label,
        hint: c.hint,
        onSelect: () => {
          close();
          c.run(router);
        },
      }));

    if (scoredCommands.length > 0)
      result.push({ heading: "Commands", items: scoredCommands });
    if (scoredArticles.length > 0)
      result.push({ heading: "Articles", items: scoredArticles });
    return result;
  }, [articles, query, recents, router, close, saveUrl]);

  const items = useMemo(() => flatten(groups), [groups]);

  // Clamp active index when results shrink
  useEffect(() => {
    if (activeIndex >= items.length)
      setActiveIndex(Math.max(0, items.length - 1));
  }, [items.length, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault();
      items[activeIndex].onSelect();
    }
  }

  if (!open) return null;

  const activeItem = items[activeIndex];

  return (
    <div className={styles.overlay} onClick={close} role="presentation">
      <div
        className={styles.palette}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
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
            placeholder="Search articles, paste a URL, or type &gt; for commands, # for tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search"
            aria-activedescendant={
              activeItem ? `cmd-item-${activeItem.id}` : undefined
            }
            aria-controls="cmd-palette-list"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
          <kbd className={styles.kbd}>esc</kbd>
        </div>

        {renderBody({
          cache,
          groups,
          items,
          activeIndex,
          setActiveIndex,
          saving,
          saveError,
          listRef,
        })}

        <div className={styles.footer}>
          <span>
            <kbd className={styles.kbdInline}>↑</kbd>
            <kbd className={styles.kbdInline}>↓</kbd> navigate
          </span>
          <span>
            <kbd className={styles.kbdInline}>↵</kbd> select
          </span>
          <span>
            <kbd className={styles.kbdInline}>&gt;</kbd> commands
          </span>
          <span>
            <kbd className={styles.kbdInline}>#</kbd> tags
          </span>
          <span>
            <kbd className={styles.kbdInline}>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function renderBody(props: {
  cache: ArticleCacheState;
  groups: Group[];
  items: Item[];
  activeIndex: number;
  setActiveIndex: (n: number) => void;
  saving: boolean;
  saveError: string | null;
  listRef: React.RefObject<HTMLUListElement | null>;
}): ReactNode {
  const {
    cache,
    groups,
    items,
    activeIndex,
    setActiveIndex,
    saving,
    saveError,
    listRef,
  } = props;

  if (saveError) {
    return (
      <p className={styles.status} role="alert">
        {saveError}
      </p>
    );
  }

  if (cache.status === "loading" && items.length === 0) {
    return <p className={styles.status}>Loading…</p>;
  }

  if (cache.status === "error" && items.length === 0) {
    return <p className={styles.status}>Couldn&apos;t load articles.</p>;
  }

  if (items.length === 0) {
    return <p className={styles.status}>No matches.</p>;
  }

  let cursor = 0;
  return (
    <ul
      ref={listRef}
      id="cmd-palette-list"
      className={styles.list}
      role="listbox"
    >
      {groups.map((g) => (
        <li key={g.heading} className={styles.groupWrapper}>
          <div className={styles.groupHeading} aria-hidden="true">
            {g.heading}
          </div>
          <ul className={styles.groupList}>
            {g.items.map((item) => {
              const index = cursor++;
              const active = index === activeIndex;
              return (
                <li
                  key={item.id}
                  id={`cmd-item-${item.id}`}
                  data-index={index}
                  className={active ? styles.itemActive : styles.item}
                  role="option"
                  aria-selected={active}
                  onClick={() => item.onSelect()}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {renderItem(item, saving)}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function renderItem(item: Item, saving: boolean): ReactNode {
  if (item.kind === "save-url") {
    return (
      <>
        <span className={styles.itemTitle}>
          {saving ? "Saving…" : "Save URL"}
        </span>
        <span className={styles.itemMeta}>
          <span className={styles.itemUrl}>{item.url}</span>
        </span>
      </>
    );
  }
  if (item.kind === "command") {
    return (
      <>
        <span className={styles.itemTitle}>{item.label}</span>
        {item.hint ? (
          <span className={styles.itemMeta}>
            <span>{item.hint}</span>
          </span>
        ) : null}
      </>
    );
  }
  if (item.kind === "tag") {
    return (
      <>
        <span className={styles.itemTitle}>#{item.tag}</span>
        <span className={styles.itemMeta}>
          <span>
            {item.count} article{item.count === 1 ? "" : "s"}
          </span>
        </span>
      </>
    );
  }
  const a = item.article;
  return (
    <>
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
    </>
  );
}
