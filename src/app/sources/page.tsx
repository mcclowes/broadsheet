import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  fetchUnifiedFeed,
  listSources,
  type Source,
  type UnifiedFeedItem,
} from "@/lib/sources";
import { articleIdForUrl, listArticles } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { PrimaryTabs } from "@/app/components/primary-tabs";
import { UserMenu } from "@/app/components/user-menu";
import { AddSourceForm } from "./add-source-form";
import { ItemActions } from "./item-actions";
import styles from "./sources.module.scss";

export const dynamic = "force-dynamic";

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
  if (diff < day) return `${Math.round(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(then).toLocaleDateString();
}

export default async function SourcesPage() {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
  const userId = authedUserId(rawUserId);

  const [sources, unified, savedArticles] = await Promise.all([
    listSources(userId),
    fetchUnifiedFeed(userId),
    listArticles(userId, {}),
  ]);

  const savedIds = new Set(savedArticles.map((a) => a.id));

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <UserMenu />
      </header>

      <PrimaryTabs active="sources" />

      <p className={styles.intro}>
        Follow a site to see its latest articles here. Nothing is saved to your
        library until you tap save — this is a magazine rack, not an inbox.
      </p>

      <AddSourceForm />

      {sources.length === 0 ? (
        <p className={styles.empty}>
          No sources yet. Paste a site URL above to start following.
        </p>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Following</h2>
              <span className={styles.sectionCount}>
                {sources.length} {sources.length === 1 ? "source" : "sources"}
              </span>
            </div>
            <SourceGrid sources={sources} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Latest</h2>
              {unified.items.length > 0 ? (
                <span className={styles.sectionCount}>
                  {unified.items.length}{" "}
                  {unified.items.length === 1 ? "item" : "items"}
                </span>
              ) : null}
            </div>
            <UnifiedList
              items={unified.items}
              savedIds={savedIds}
              hasErrors={unified.errors.length > 0}
              allErrored={unified.errors.length === sources.length}
            />
          </section>
        </>
      )}
    </main>
  );
}

function SourceGrid({ sources }: { sources: Source[] }) {
  return (
    <ul className={styles.sourceList}>
      {sources.map((s) => {
        const host = hostOf(s.siteUrl) ?? hostOf(s.feedUrl);
        const updated = formatRelative(s.lastFetchedAt);
        return (
          <li key={s.id}>
            <Link
              href={`/sources/${s.id}`}
              className={`${styles.sourceCard} ${
                s.lastError ? styles.sourceCardError : ""
              }`}
            >
              <div className={styles.sourceCardBody}>
                <p className={styles.sourceTitle}>{s.title}</p>
                <p className={styles.sourceHost}>
                  {host ?? s.feedUrl}
                  {updated ? <span> · updated {updated}</span> : null}
                </p>
                {s.lastError ? (
                  <p className={styles.sourceError} title={s.lastError}>
                    Couldn&apos;t fetch feed
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UnifiedList({
  items,
  savedIds,
  hasErrors,
  allErrored,
}: {
  items: UnifiedFeedItem[];
  savedIds: Set<string>;
  hasErrors: boolean;
  allErrored: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className={styles.empty}>
        {allErrored
          ? "Couldn't reach your feeds right now. Try again in a moment."
          : hasErrors
            ? "Some feeds couldn't be reached, and the rest are empty."
            : "Nothing new yet. Articles will show up here as your sources publish."}
      </p>
    );
  }
  return (
    <ul className={styles.itemList}>
      {items.map((item) => {
        const alreadySaved = savedIds.has(articleIdForUrl(item.url));
        const when = formatRelative(item.publishedAt);
        return (
          <li key={`${item.sourceId}:${item.url}`} className={styles.item}>
            <div className={styles.itemHeader}>
              <h2 className={styles.itemTitle}>
                <a href={item.url} target="_blank" rel="noreferrer noopener">
                  {item.title}
                </a>
              </h2>
            </div>
            <div className={styles.itemMeta}>
              <Link
                href={`/sources/${item.sourceId}`}
                className={styles.itemSourceLink}
              >
                {item.sourceTitle}
              </Link>
              {when ? <span>· {when}</span> : null}
              {alreadySaved ? (
                <span className={styles.itemSavedBadge}>In library</span>
              ) : null}
            </div>
            {item.excerpt ? (
              <p className={styles.itemExcerpt}>{item.excerpt}</p>
            ) : null}
            <ItemActions url={item.url} initiallySaved={alreadySaved} />
          </li>
        );
      })}
    </ul>
  );
}
