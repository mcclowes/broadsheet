import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { notFound, redirect } from "next/navigation";
import { fetchSourceItems, getSource } from "@/lib/sources";
import { articleIdForUrl, listArticles } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { ItemActions } from "../item-actions";
import { RemoveSourceButton } from "../remove-source-button";
import styles from "../sources.module.scss";

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

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  const source = await getSource(userId, id);
  if (!source) notFound();

  const [fetched, savedArticles] = await Promise.all([
    fetchSourceItems(userId, source),
    listArticles(userId, {}),
  ]);
  const savedIds = new Set(savedArticles.map((a) => a.id));

  const host = hostOf(source.siteUrl) ?? hostOf(source.feedUrl);

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

      <div className={styles.perSiteHeader}>
        <h1 className={styles.perSiteTitle}>{source.title}</h1>
        <div className={styles.perSiteMeta}>
          {source.siteUrl ? (
            <a
              href={source.siteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.itemOriginalLink}
            >
              {host ?? source.siteUrl}
            </a>
          ) : host ? (
            <span>{host}</span>
          ) : null}
          <RemoveSourceButton sourceId={source.id} sourceTitle={source.title} />
        </div>
      </div>

      {fetched.error ? (
        <div className={styles.errorBanner}>
          Could not fetch this feed: {fetched.error}
          {fetched.items.length > 0 ? " (showing last-known items)" : null}
        </div>
      ) : null}

      {fetched.items.length === 0 ? (
        <p className={styles.empty}>No items in this feed right now.</p>
      ) : (
        <ul className={styles.itemList}>
          {fetched.items.map((item) => {
            const alreadySaved = savedIds.has(articleIdForUrl(item.url));
            const when = formatRelative(item.publishedAt);
            return (
              <li key={item.url} className={styles.item}>
                <div className={styles.itemHeader}>
                  <h2 className={styles.itemTitle}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {item.title}
                    </a>
                  </h2>
                </div>
                <div className={styles.itemMeta}>
                  {when ? <span>{when}</span> : null}
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
      )}
    </main>
  );
}
