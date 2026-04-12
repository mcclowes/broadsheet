import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { listArticles, type LibraryView, type ReadState } from "@/lib/articles";
import { SaveForm } from "./save-form";
import { CacheLibrary } from "./cache-library";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./library.module.scss";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  view?: string;
  state?: string;
  tag?: string;
  source?: string;
}>;

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
  },
  overrides: Partial<{
    view: LibraryView;
    state: ReadState;
    tag: string | null;
    source: string | null;
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

  if (view !== "inbox") params.set("view", view);
  if (state !== "unread") params.set("state", state);
  if (tag) params.set("tag", tag);
  if (source) params.set("source", source);

  const q = params.toString();
  return q ? `/library?${q}` : "/library";
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const sp = await searchParams;
  const view = parseView(sp.view);
  const state = parseState(sp.state);
  const tag = sp.tag?.trim() || undefined;
  const source = sp.source?.trim() || undefined;
  const current = { view, state, tag, source };

  const [articles, allArticles] = await Promise.all([
    listArticles(userId, current),
    listArticles(userId, {}),
  ]);

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

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <div className={styles.headerActions}>
          <SaveForm />
          <UserButton />
        </div>
      </header>

      <nav className={styles.topTabs} aria-label="Primary">
        <Link href="/library" className={styles.topTabActive}>
          Library
        </Link>
        <Link href="/sources" className={styles.topTab}>
          Sources
        </Link>
      </nav>

      <nav className={styles.filters} aria-label="Library filters">
        <div className={styles.filterGroup}>
          <Link
            href={filterLink(current, { view: "inbox" })}
            className={view === "inbox" ? styles.filterActive : styles.filter}
          >
            Inbox
          </Link>
          <Link
            href={filterLink(current, { view: "archive" })}
            className={view === "archive" ? styles.filterActive : styles.filter}
          >
            Archive
          </Link>
        </div>
        <div className={styles.filterGroup}>
          <Link
            href={filterLink(current, { state: "all" })}
            className={state === "all" ? styles.filterActive : styles.filter}
          >
            All
          </Link>
          <Link
            href={filterLink(current, { state: "unread" })}
            className={state === "unread" ? styles.filterActive : styles.filter}
          >
            Unread
          </Link>
          <Link
            href={filterLink(current, { state: "read" })}
            className={state === "read" ? styles.filterActive : styles.filter}
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
        {popularTags.length > 0 && !tag ? (
          <div className={styles.tagList}>
            {popularTags.map((t) => (
              <Link
                key={t}
                href={filterLink(current, { tag: t })}
                className={styles.tagChip}
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
              <Link href={`/read/${a.id}`} className={styles.link}>
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
