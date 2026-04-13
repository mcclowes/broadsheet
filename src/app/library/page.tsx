import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import {
  listArticles,
  filterArticles,
  type LibraryView,
  type ReadState,
} from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { SaveForm } from "./save-form";
import { DigestToggle } from "./digest-toggle";
import { CacheLibrary } from "./cache-library";
import { SwipeableArticleLink } from "./swipeable-article-link";
import { LibraryItemMenu } from "./library-item-menu";
import { PaletteTrigger } from "@/app/components/palette-trigger";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./library.module.scss";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  view?: string;
  state?: string;
  tag?: string;
  source?: string;
  page?: string;
}>;

const PAGE_SIZE = 50;

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parseView(raw: string | undefined): LibraryView {
  return raw === "archive" ? "archive" : "inbox";
}

function parseState(raw: string | undefined): ReadState {
  if (raw === "read" || raw === "all") return raw;
  return "unread";
}

function filterLink(
  current: {
    view: LibraryView;
    state: ReadState;
    tag?: string;
    source?: string;
    page: number;
  },
  overrides: Partial<{
    view: LibraryView;
    state: ReadState;
    tag: string | null;
    source: string | null;
    page: number;
  }>,
): string {
  const params = new URLSearchParams();
  const view = overrides.view ?? current.view;
  const state = overrides.state ?? current.state;
  const tag =
    overrides.tag === null ? undefined : (overrides.tag ?? current.tag);
  const source =
    overrides.source === null
      ? undefined
      : (overrides.source ?? current.source);
  // Any filter change (besides explicit page override) resets pagination.
  const filtersChanged =
    overrides.view !== undefined ||
    overrides.state !== undefined ||
    overrides.tag !== undefined ||
    overrides.source !== undefined;
  const page = overrides.page ?? (filtersChanged ? 1 : current.page);

  if (view !== "inbox") params.set("view", view);
  if (state !== "unread") params.set("state", state);
  if (tag) params.set("tag", tag);
  if (source) params.set("source", source);
  if (page > 1) params.set("page", String(page));

  const q = params.toString();
  return q ? `/library?${q}` : "/library";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
  const userId = authedUserId(rawUserId);

  const sp = await searchParams;
  const view = parseView(sp.view);
  const state = parseState(sp.state);
  const tag = sp.tag?.trim() || undefined;
  const source = sp.source?.trim() || undefined;
  const page = parsePage(sp.page);
  const current = { view, state, tag, source, page };

  // Single fetch — filter in-memory to avoid duplicate Blob scans
  const allArticles = await listArticles(userId, {});
  const filteredArticles = filterArticles(allArticles, current);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredArticles.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const articles = filteredArticles.slice(pageStart, pageStart + PAGE_SIZE);

  const tagCounts = new Map<string, number>();
  for (const a of allArticles) {
    if (a.archivedAt) continue;
    for (const t of a.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const popularTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);

  const summariesForCache = allArticles.map((a) => ({
    id: a.id,
    title: a.title,
    url: a.url,
    source: a.source,
    byline: a.byline,
    excerpt: a.excerpt,
    lang: a.lang,
    image: a.image ?? null,
    wordCount: a.wordCount,
    readMinutes: a.readMinutes,
    savedAt: a.savedAt,
    readAt: a.readAt,
    archivedAt: a.archivedAt,
    tags: a.tags,
  }));

  return (
    <main className={styles.main}>
      <CacheLibrary articles={summariesForCache} />

      <h1 className="srOnly">Library</h1>

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <div className={styles.headerActions}>
          <PaletteTrigger />
          <SaveForm />
          <UserButton />
        </div>
      </header>

      <nav className={styles.topTabs} aria-label="Primary">
        <div className={styles.topTabsLeft}>
          <Link href="/library" className={styles.topTabActive}>
            Library
          </Link>
          <Link href="/sources" className={styles.topTab}>
            Sources
          </Link>
          <Link href="/settings" className={styles.topTab}>
            Settings
          </Link>
        </div>
        <DigestToggle />
      </nav>

      <nav className={styles.filters} aria-label="Library filters">
        <div className={styles.filterGroup}>
          <Link
            href={filterLink(current, { view: "inbox" })}
            className={view === "inbox" ? styles.filterActive : styles.filter}
            {...(view === "inbox" && { "aria-current": "page" as const })}
          >
            Inbox
          </Link>
          <Link
            href={filterLink(current, { view: "archive" })}
            className={view === "archive" ? styles.filterActive : styles.filter}
            {...(view === "archive" && { "aria-current": "page" as const })}
          >
            Archive
          </Link>
        </div>
        <div className={styles.filterGroup}>
          <Link
            href={filterLink(current, { state: "all" })}
            className={state === "all" ? styles.filterActive : styles.filter}
            {...(state === "all" && { "aria-current": "page" as const })}
          >
            All
          </Link>
          <Link
            href={filterLink(current, { state: "unread" })}
            className={state === "unread" ? styles.filterActive : styles.filter}
            {...(state === "unread" && { "aria-current": "page" as const })}
          >
            Unread
          </Link>
          <Link
            href={filterLink(current, { state: "read" })}
            className={state === "read" ? styles.filterActive : styles.filter}
            {...(state === "read" && { "aria-current": "page" as const })}
          >
            Read
          </Link>
        </div>
        {(tag || source) && (
          <div className={styles.activeFilters}>
            {tag ? (
              <Link
                href={filterLink(current, { tag: null })}
                className={styles.activeFilter}
              >
                tag: {tag} ×
              </Link>
            ) : null}
            {source ? (
              <Link
                href={filterLink(current, { source: null })}
                className={styles.activeFilter}
              >
                {source} ×
              </Link>
            ) : null}
          </div>
        )}
        {popularTags.length > 0 ? (
          <div className={styles.tagList}>
            {popularTags.map((t) => (
              <Link
                key={t}
                href={filterLink(current, { tag: tag === t ? null : t })}
                className={tag === t ? styles.tagChipActive : styles.tagChip}
                {...(tag === t && { "aria-current": "true" as const })}
              >
                #{t}
              </Link>
            ))}
          </div>
        ) : null}
      </nav>

      {articles.length === 0 ? (
        <p className={styles.empty}>
          {allArticles.length === 0
            ? "Nothing saved yet. Tap the + button to save your first article."
            : "No articles match these filters."}
        </p>
      ) : (
        <ul className={styles.list}>
          {articles.map((a) => (
            <li key={a.id} className={styles.item}>
              <SwipeableArticleLink
                articleId={a.id}
                href={`/read/${a.id}?from=${encodeURIComponent(filterLink(current, {}))}`}
                initialRead={Boolean(a.readAt)}
                linkClassName={styles.link}
              >
                <h2 className={styles.title}>{a.title}</h2>
                <div className={styles.meta}>
                  {a.source ? (
                    <span className={styles.source}>
                      <PublicationIcon url={a.url} />
                      {a.source}
                    </span>
                  ) : null}
                  <span>{a.readMinutes} min read</span>
                  {a.readAt ? <span className={styles.read}>Read</span> : null}
                  {a.archivedAt ? (
                    <span className={styles.archived}>Archived</span>
                  ) : null}
                </div>
                {a.excerpt ? (
                  <p className={styles.excerpt}>{a.excerpt}</p>
                ) : null}
                {a.tags.length > 0 ? (
                  <div className={styles.itemTags}>
                    {a.tags.map((t) => (
                      <span key={t} className={styles.itemTag}>
                        #{t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </SwipeableArticleLink>
              <LibraryItemMenu
                articleId={a.id}
                articleUrl={a.url}
                initialRead={Boolean(a.readAt)}
                initialArchived={Boolean(a.archivedAt)}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Pagination">
          {safePage > 1 ? (
            <Link
              href={filterLink(current, { page: safePage - 1 })}
              className={styles.paginationLink}
              rel="prev"
            >
              ← Previous
            </Link>
          ) : (
            <span className={styles.paginationDisabled}>← Previous</span>
          )}
          <span className={styles.paginationStatus}>
            Page {safePage} of {totalPages}
          </span>
          {safePage < totalPages ? (
            <Link
              href={filterLink(current, { page: safePage + 1 })}
              className={styles.paginationLink}
              rel="next"
            >
              Next →
            </Link>
          ) : (
            <span className={styles.paginationDisabled}>Next →</span>
          )}
        </nav>
      ) : null}
    </main>
  );
}
