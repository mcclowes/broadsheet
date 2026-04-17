import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import {
  listArticles,
  filterArticles,
  type ArticleSummary,
  type LibraryView,
  type ReadState,
} from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { SaveForm } from "./save-form";
import { DigestToggle } from "./digest-toggle";
import { CacheLibrary } from "./cache-library";
import { SwipeableArticleLink } from "./swipeable-article-link";
import { LibraryItemMenu } from "./library-item-menu";
import { Masthead } from "./masthead";
import { FilterMenu, type FilterMenuOption } from "./filter-menu";
import { SearchBox } from "./search-box";
import { PaletteTrigger } from "@/app/components/palette-trigger";
import { PrimaryTabs } from "@/app/components/primary-tabs";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./library.module.scss";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  view?: string;
  state?: string;
  tag?: string;
  source?: string;
  length?: string;
  sort?: string;
  q?: string;
  page?: string;
}>;

const PAGE_SIZE = 50;

type LengthBucket = "any" | "short" | "medium" | "long";
type SortKey = "newest" | "oldest" | "longest" | "shortest" | "title";

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parseView(raw: string | undefined): LibraryView {
  return raw === "archive" ? "archive" : "inbox";
}

function parseState(raw: string | undefined): ReadState {
  if (raw === "read" || raw === "all" || raw === "reading") return raw;
  return "unread";
}

function parseLength(raw: string | undefined): LengthBucket {
  if (raw === "short" || raw === "medium" || raw === "long") return raw;
  return "any";
}

function parseSort(raw: string | undefined): SortKey {
  if (
    raw === "oldest" ||
    raw === "longest" ||
    raw === "shortest" ||
    raw === "title"
  )
    return raw;
  return "newest";
}

interface CurrentFilters {
  view: LibraryView;
  state: ReadState;
  tag?: string;
  source?: string;
  length: LengthBucket;
  sort: SortKey;
  q?: string;
  page: number;
}

function filterLink(
  current: CurrentFilters,
  overrides: Partial<{
    view: LibraryView;
    state: ReadState;
    tag: string | null;
    source: string | null;
    length: LengthBucket;
    sort: SortKey;
    q: string | null;
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
  const length = overrides.length ?? current.length;
  const sort = overrides.sort ?? current.sort;
  const q = overrides.q === null ? undefined : (overrides.q ?? current.q);
  const filtersChanged =
    overrides.view !== undefined ||
    overrides.state !== undefined ||
    overrides.tag !== undefined ||
    overrides.source !== undefined ||
    overrides.length !== undefined ||
    overrides.q !== undefined;
  const page = overrides.page ?? (filtersChanged ? 1 : current.page);

  if (view !== "inbox") params.set("view", view);
  if (state !== "unread") params.set("state", state);
  if (tag) params.set("tag", tag);
  if (source) params.set("source", source);
  if (length !== "any") params.set("length", length);
  if (sort !== "newest") params.set("sort", sort);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/library?${qs}` : "/library";
}

function applyLength(
  articles: ArticleSummary[],
  length: LengthBucket,
): ArticleSummary[] {
  if (length === "any") return articles;
  return articles.filter((a) => {
    if (length === "short") return a.readMinutes <= 8;
    if (length === "medium") return a.readMinutes > 8 && a.readMinutes <= 15;
    return a.readMinutes > 15;
  });
}

function applySort(
  articles: ArticleSummary[],
  sort: SortKey,
): ArticleSummary[] {
  if (sort === "newest") return articles;
  const copy = [...articles];
  if (sort === "oldest") {
    copy.sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  } else if (sort === "longest") {
    copy.sort((a, b) => b.readMinutes - a.readMinutes);
  } else if (sort === "shortest") {
    copy.sort((a, b) => a.readMinutes - b.readMinutes);
  } else if (sort === "title") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  return copy;
}

function formatReadingBudget(totalMin: number): string {
  if (totalMin <= 0) return "0m";
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

interface DateBucket {
  label: string;
  items: ArticleSummary[];
}

function bucketLabel(iso: string, now: number): string {
  const diffD = (now - Date.parse(iso)) / 86400000;
  if (diffD < 1) return "Today";
  if (diffD < 2) return "Yesterday";
  if (diffD < 7) return "This week";
  if (diffD < 30) return "This month";
  if (diffD < 90) return "Earlier this quarter";
  return "Older";
}

function bucketByDate(articles: ArticleSummary[]): DateBucket[] {
  const now = Date.now();
  const map = new Map<string, ArticleSummary[]>();
  const order: string[] = [];
  for (const a of articles) {
    const label = bucketLabel(a.savedAt, now);
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(a);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

function relTime(iso: string): string {
  const now = Date.now();
  const t = Date.parse(iso);
  const diffMin = Math.round((now - t) / 60000);
  if (diffMin < 60) return `${Math.max(1, diffMin)}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function articleStatus(
  a: ArticleSummary,
): { kind: "reading" | "read" | "archived"; pct?: number } | null {
  if (a.archivedAt) return { kind: "archived" };
  if (a.readAt) return { kind: "read" };
  if (a.lastReadAt) {
    const pct = a.readProgress ?? 0;
    return { kind: "reading", pct: Math.max(0.02, Math.min(1, pct)) };
  }
  return null;
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
  // Archive collapses state — the read/unread distinction is noise there.
  const state = view === "archive" ? "all" : parseState(sp.state);
  const tag = sp.tag?.trim() || undefined;
  const source = sp.source?.trim() || undefined;
  const length = parseLength(sp.length);
  const sort = parseSort(sp.sort);
  const q = sp.q?.trim() || undefined;
  const page = parsePage(sp.page);
  const current: CurrentFilters = {
    view,
    state,
    tag,
    source,
    length,
    sort,
    q,
    page,
  };

  // Single fetch — filter in-memory to avoid duplicate Blob scans
  const allArticles = await listArticles(userId, {});

  // Counts for the masthead — whole-library snapshot, unaffected by current filters.
  const inboxArticles = allArticles.filter((a) => !a.archivedAt);
  const archiveCount = allArticles.length - inboxArticles.length;
  const unreadCount = inboxArticles.filter(
    (a) => !a.readAt && !a.lastReadAt,
  ).length;
  const readingCount = inboxArticles.filter(
    (a) => !a.readAt && a.lastReadAt,
  ).length;
  const readCount = inboxArticles.filter((a) => a.readAt).length;
  const counts = {
    unread: unreadCount,
    reading: readingCount,
    read: readCount,
    archive: archiveCount,
    inbox: inboxArticles.length,
  };

  const filteredCore = filterArticles(allArticles, {
    view,
    state,
    tag,
    source,
    q,
  });
  const filteredArticles = applySort(applyLength(filteredCore, length), sort);

  const totalReadMin = filteredArticles.reduce((s, a) => s + a.readMinutes, 0);

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

  const grouped = bucketByDate(articles);

  const lengthOptions: FilterMenuOption[] = (
    [
      { key: "any", label: "Any length" },
      { key: "short", label: "Short · ≤ 8 min" },
      { key: "medium", label: "Medium · 9–15 min" },
      { key: "long", label: "Long · 15+ min" },
    ] as const
  ).map((o) => ({
    key: o.key,
    label: o.label,
    href: filterLink(current, { length: o.key }),
    active: length === o.key,
  }));

  const sortOptions: FilterMenuOption[] = (
    [
      { key: "newest", label: "Newest saved" },
      { key: "oldest", label: "Oldest saved" },
      { key: "longest", label: "Longest read" },
      { key: "shortest", label: "Shortest read" },
      { key: "title", label: "Title A–Z" },
    ] as const
  ).map((o) => ({
    key: o.key,
    label: o.label,
    href: filterLink(current, { sort: o.key }),
    active: sort === o.key,
  }));

  const lengthLabel =
    length === "any"
      ? "Length: any"
      : `Length: ${length === "short" ? "≤ 8 min" : length === "medium" ? "9–15 min" : "15+ min"}`;
  const sortLabelMap: Record<SortKey, string> = {
    newest: "Sort: newest",
    oldest: "Sort: oldest",
    longest: "Sort: longest",
    shortest: "Sort: shortest",
    title: "Sort: A–Z",
  };

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

      <PrimaryTabs active="library" right={<DigestToggle />} />

      <Masthead counts={counts} />

      <nav className={styles.filters} aria-label="Library filters">
        <div className={styles.viewSegmented} role="tablist">
          <Link
            href={filterLink(current, { view: "inbox" })}
            role="tab"
            aria-selected={view === "inbox"}
            className={view === "inbox" ? styles.viewSegActive : styles.viewSeg}
          >
            <span>Inbox</span>
            <span className={styles.segCount}>{counts.inbox}</span>
          </Link>
          <Link
            href={filterLink(current, { view: "archive", state: "all" })}
            role="tab"
            aria-selected={view === "archive"}
            className={
              view === "archive" ? styles.viewSegActive : styles.viewSeg
            }
          >
            <span>Archive</span>
            <span className={styles.segCount}>{counts.archive}</span>
          </Link>
        </div>

        {view === "inbox" ? (
          <>
            <span className={styles.filterDivider} aria-hidden="true" />
            <div className={styles.stateSegmented} role="tablist">
              <StateTab
                label="All"
                isActive={state === "all"}
                href={filterLink(current, { state: "all" })}
              />
              <StateTab
                label="Unread"
                count={counts.unread}
                isActive={state === "unread"}
                href={filterLink(current, { state: "unread" })}
              />
              <StateTab
                label="Reading"
                count={counts.reading}
                isActive={state === "reading"}
                href={filterLink(current, { state: "reading" })}
              />
              <StateTab
                label="Read"
                count={counts.read}
                isActive={state === "read"}
                href={filterLink(current, { state: "read" })}
              />
            </div>
          </>
        ) : null}

        <span className={styles.filterSpacer} />

        <div className={styles.filterControls}>
          <SearchBox
            initialValue={q ?? ""}
            buildHref={(next) => filterLink(current, { q: next })}
          />
          <FilterMenu
            label="Filter by length"
            summary={lengthLabel}
            options={lengthOptions}
          />
          <FilterMenu
            label="Sort articles"
            summary={sortLabelMap[sort]}
            options={sortOptions}
          />
        </div>
      </nav>

      {tag || source || length !== "any" ? (
        <div className={styles.activeFilters}>
          {tag ? (
            <Link
              href={filterLink(current, { tag: null })}
              className={styles.activeFilter}
            >
              <span>tag: {tag}</span>
              <span aria-hidden>×</span>
            </Link>
          ) : null}
          {source ? (
            <Link
              href={filterLink(current, { source: null })}
              className={styles.activeFilter}
            >
              <span>{source}</span>
              <span aria-hidden>×</span>
            </Link>
          ) : null}
          {length !== "any" ? (
            <Link
              href={filterLink(current, { length: "any" })}
              className={styles.activeFilter}
            >
              <span>length: {length}</span>
              <span aria-hidden>×</span>
            </Link>
          ) : null}
        </div>
      ) : null}

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

      <p className={styles.summaryLine}>
        <span>
          Showing {filteredArticles.length} of {allArticles.length}
        </span>
        <span aria-hidden>·</span>
        <span>Est. {formatReadingBudget(totalReadMin)} of reading</span>
        <span aria-hidden>·</span>
        <span>{view === "archive" ? "Archive" : "Inbox"}</span>
      </p>

      {articles.length === 0 ? (
        <EmptyState
          mode={
            allArticles.length === 0
              ? "empty"
              : view === "archive"
                ? "archive"
                : q
                  ? "search"
                  : "filters"
          }
          q={q}
        />
      ) : (
        <div className={styles.groups}>
          {grouped.map((bucket) => (
            <section key={bucket.label} className={styles.group}>
              <h2 className={styles.groupLabel}>
                <span>{bucket.label}</span>
                <span aria-hidden className={styles.groupRule} />
                <span className={styles.groupCount}>{bucket.items.length}</span>
              </h2>
              <ul className={styles.list}>
                {bucket.items.map((a) => {
                  const status = articleStatus(a);
                  const href = `/read/${a.id}?from=${encodeURIComponent(filterLink(current, {}))}`;
                  return (
                    <li key={a.id} className={styles.item}>
                      <SwipeableArticleLink
                        articleId={a.id}
                        href={href}
                        initialRead={Boolean(a.readAt)}
                        linkClassName={styles.link}
                      >
                        <div className={styles.itemMeta}>
                          {a.source ? (
                            <span className={styles.source}>
                              <PublicationIcon url={a.url} />
                              <span className={styles.sourceName}>
                                {a.source}
                              </span>
                            </span>
                          ) : null}
                          {a.source ? (
                            <span aria-hidden className={styles.metaSep}>
                              ·
                            </span>
                          ) : null}
                          <span>{a.readMinutes} min</span>
                          <span aria-hidden className={styles.metaSep}>
                            ·
                          </span>
                          <span>{relTime(a.savedAt)}</span>
                        </div>
                        <h3 className={styles.title}>{a.title}</h3>
                        {a.excerpt ? (
                          <p className={styles.excerpt}>
                            {a.byline ? (
                              <em className={styles.byline}>{a.byline}. </em>
                            ) : null}
                            {a.excerpt}
                          </p>
                        ) : null}
                        {status?.kind === "reading" ? (
                          <div
                            className={styles.progressTrack}
                            aria-label={`${Math.round((status.pct ?? 0) * 100)}% read`}
                          >
                            <span
                              className={styles.progressFill}
                              style={{
                                width: `${Math.round((status.pct ?? 0) * 100)}%`,
                              }}
                            />
                          </div>
                        ) : null}
                      </SwipeableArticleLink>
                      {status || a.tags.length > 0 ? (
                        <div className={styles.itemFooter}>
                          {status?.kind === "read" ? (
                            <span className={styles.badgeOk}>Read</span>
                          ) : null}
                          {status?.kind === "reading" ? (
                            <span className={styles.badgeAccent}>
                              Reading · {Math.round((status.pct ?? 0) * 100)}%
                            </span>
                          ) : null}
                          {status?.kind === "archived" ? (
                            <span className={styles.badgeMuted}>Archived</span>
                          ) : null}
                          {a.tags.length > 0 ? (
                            <span className={styles.itemTags}>
                              {a.tags.map((t) => (
                                <Link
                                  key={t}
                                  href={filterLink(current, {
                                    tag: tag === t ? null : t,
                                  })}
                                  className={styles.itemTag}
                                >
                                  #{t}
                                </Link>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <LibraryItemMenu
                        articleId={a.id}
                        articleUrl={a.url}
                        initialRead={Boolean(a.readAt)}
                        initialArchived={Boolean(a.archivedAt)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
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

function StateTab({
  label,
  count,
  isActive,
  href,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={isActive}
      className={isActive ? styles.stateSegActive : styles.stateSeg}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span className={styles.segCount}>{count}</span>
      ) : null}
    </Link>
  );
}

function EmptyState({
  mode,
  q,
}: {
  mode: "empty" | "archive" | "search" | "filters";
  q?: string;
}) {
  const { title, body } = emptyCopy(mode, q);
  return (
    <div className={styles.empty} role="status">
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyBody}>{body}</p>
    </div>
  );
}

function emptyCopy(
  mode: "empty" | "archive" | "search" | "filters",
  q?: string,
): { title: string; body: string } {
  switch (mode) {
    case "empty":
      return {
        title: "Nothing here yet.",
        body: "Save your first article with the extension or the + button.",
      };
    case "archive":
      return {
        title: "Nothing archived.",
        body: "Articles you archive will land here.",
      };
    case "search":
      return {
        title: `No matches for “${q ?? ""}”.`,
        body: "Try a different query or clear filters.",
      };
    default:
      return {
        title: "No articles match these filters.",
        body: "Try clearing a filter or widening the length range.",
      };
  }
}
