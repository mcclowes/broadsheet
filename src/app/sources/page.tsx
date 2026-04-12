import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import {
  fetchUnifiedFeed,
  listSources,
  type Source,
  type UnifiedFeedItem,
} from "@/lib/sources";
import { articleIdForUrl, listArticles } from "@/lib/articles";
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
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

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
        <UserButton />
      </header>

      <nav className={styles.tabs} aria-label="Primary">
        <Link href="/library" className={styles.tab}>
          Library
        </Link>
        <Link href="/sources" className={styles.tabActive}>
          Sources
        </Link>
      </nav>

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
          <SourceGrid sources={sources} />
          <UnifiedList items={unified.items} savedIds={savedIds} />
          {unified.errors.length > 0 ? (
            <div className={styles.errorBanner}>
              Could not fetch{" "}
              {unified.errors.map((e) => e.sourceTitle).join(", ")}.
            </div>
          ) : null}
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
        return (
          <li key={s.id}>
            <Link href={`/sources/${s.id}`} className={styles.sourceCard}>
              <div>
                <p className={styles.sourceTitle}>{s.title}</p>
                {host ? <p className={styles.sourceHost}>{host}</p> : null}
              </div>
              {s.lastError ? (
                <span
                  className={styles.sourceErrorDot}
                  aria-label={`Last fetch failed: ${s.lastError}`}
                />
              ) : null}
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
}: {
  items: UnifiedFeedItem[];
  savedIds: Set<string>;
}) {
  if (items.length === 0) {
    return (
      <p className={styles.empty}>
        No items found in your sources. They might be empty, or the feeds might
        be unreachable right now.
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
