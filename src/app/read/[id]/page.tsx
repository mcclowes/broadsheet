import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import {
  getArticle,
  listArticles,
  rehydrateArticle,
  suggestNextArticle,
} from "@/lib/articles";
import { fetchAndParse, IngestError } from "@/lib/ingest";
import { listHighlights, listUnanchoredHighlights } from "@/lib/annotations";
import { renderMarkdown } from "@/lib/markdown";
import { authedUserId } from "@/lib/auth-types";
import { Annotator } from "./annotator";
import { ArticleActions } from "./article-actions";
import { ArticleMenu } from "./article-menu";
import { ReadTracker } from "./read-tracker";
import { ReadingProgress } from "./reading-progress";
import { QuickActions } from "./quick-actions";
import { EndOfArticle } from "./end-of-article";
import { ScrollNav } from "./scroll-nav";
import { ArticleToc } from "./article-toc";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./read.module.scss";

export const dynamic = "force-dynamic";

// Memoised per request so generateMetadata and the page share a single read
// instead of hitting Folio twice.
const getArticleCached = cache(getArticle);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) return { title: "Read", robots: { index: false } };

  const { id } = await params;
  const article = await getArticleCached(authedUserId(rawUserId), id);
  if (!article) return { title: "Article not found", robots: { index: false } };

  return {
    // article.title can fall back to the URL for not-yet-ingested saves; the
    // template still wraps it as "<url> · Broadsheet", which is acceptable.
    title: article.title,
    description: article.excerpt ?? undefined,
    robots: { index: false, follow: false },
  };
}

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from?.startsWith("/library") ? from : "/library";
  const [articleResult, highlights, unanchoredHighlights] = await Promise.all([
    getArticleCached(userId, id),
    listHighlights(userId, id),
    listUnanchoredHighlights(userId, id),
  ]);
  let article = articleResult;
  if (!article) notFound();

  let rehydrateError: string | null = null;
  if (article.pendingIngest) {
    try {
      const { parsed } = await fetchAndParse(article.url);
      await rehydrateArticle(userId, article.id, parsed);
      const refreshed = await getArticle(userId, article.id);
      if (refreshed) article = refreshed;
    } catch (err) {
      rehydrateError =
        err instanceof IngestError
          ? err.publicMessage
          : "Couldn't fetch the full article.";
      console.error("[read] rehydrate failed", {
        id: article.id,
        url: article.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const html = renderMarkdown(article.body);

  // "Read next" suggestion for the end-of-article footer (#198). Inbox view
  // already excludes archived items; suggestNextArticle drops the current
  // article and anything already read, then ranks by source/tag overlap.
  const inbox = await listArticles(userId, { view: "inbox" });
  const nextArticle = suggestNextArticle(inbox, article);
  const nextSuggestion = nextArticle
    ? {
        id: nextArticle.id,
        title: nextArticle.title,
        url: nextArticle.url,
        source: nextArticle.source,
        readMinutes: nextArticle.readMinutes,
      }
    : null;

  return (
    <main className={styles.main}>
      <ReadingProgress />

      <ScrollNav>
        <nav className={styles.nav}>
          <Link href={backHref} className={styles.back}>
            ← Library
          </Link>
        </nav>
      </ScrollNav>

      {article.image ? (
        <figure className={styles.heroFigure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image}
            alt=""
            className={styles.heroImage}
            loading="eager"
          />
        </figure>
      ) : null}

      <header className={styles.header}>
        <h1 className={styles.title}>{article.title}</h1>
        <div className={styles.meta}>
          {article.byline ? <span>{article.byline}</span> : null}
          {article.source ? (
            <span className={styles.source}>
              <PublicationIcon url={article.url} size={18} />
              {article.source}
            </span>
          ) : null}
          <span>{article.readMinutes} min read</span>
          <ArticleMenu
            articleId={article.id}
            articleUrl={article.url}
            initialArchived={article.archivedAt !== null}
            initialRead={article.readAt !== null}
          />
        </div>
        <ArticleActions articleId={article.id} initialTags={article.tags} />
      </header>

      <ReadTracker
        articleId={article.id}
        alreadyRead={article.readAt !== null}
      />

      {rehydrateError ? (
        <p className={styles.rehydrateError} role="alert">
          {rehydrateError} You can{" "}
          <a href={article.url} target="_blank" rel="noreferrer">
            open the original
          </a>{" "}
          or reload to retry.
        </p>
      ) : null}

      <ArticleToc />

      <Annotator articleId={article.id} html={html} initial={highlights} />

      {unanchoredHighlights.length > 0 ? (
        <section
          className={styles.importedHighlights}
          aria-label="Imported highlights"
        >
          <h2>Imported highlights</h2>
          <ul>
            {unanchoredHighlights.map((h) => (
              <li key={h.id}>
                <blockquote>{h.text}</blockquote>
                {h.note ? <p>{h.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EndOfArticle
        articleId={article.id}
        backHref={backHref}
        initialArchived={article.archivedAt !== null}
        next={nextSuggestion}
      />

      <QuickActions
        articleId={article.id}
        articleUrl={article.url}
        initialArchived={article.archivedAt !== null}
        initialRead={article.readAt !== null}
      />
    </main>
  );
}
