import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getArticle, rehydrateArticle } from "@/lib/articles";
import { fetchAndParse, IngestError } from "@/lib/ingest";
import { listHighlights, listUnanchoredHighlights } from "@/lib/annotations";
import { renderMarkdown } from "@/lib/markdown";
import { authedUserId } from "@/lib/auth-types";
import { Annotator } from "./annotator";
import { ArticleActions } from "./article-actions";
import { ArticleMenu } from "./article-menu";
import { ReadTracker } from "./read-tracker";
import { CacheArticle } from "./cache-article";
import { ReadingProgress } from "./reading-progress";
import { QuickActions } from "./quick-actions";
import { ScrollNav } from "./scroll-nav";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./read.module.scss";

export const dynamic = "force-dynamic";

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
  let article = await getArticle(userId, id);
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

  // Body stores the article as markdown (per the PRD); render via
  // marked → DOMPurify at request time.
  const html = renderMarkdown(article.body);
  const highlights = await listHighlights(userId, article.id);
  const unanchoredHighlights = await listUnanchoredHighlights(
    userId,
    article.id,
  );

  return (
    <main className={styles.main}>
      <ReadingProgress />
      <CacheArticle
        article={{
          id: article.id,
          title: article.title,
          url: article.url,
          source: article.source,
          byline: article.byline,
          excerpt: article.excerpt,
          lang: article.lang,
          image: article.image ?? null,
          wordCount: article.wordCount,
          readMinutes: article.readMinutes,
          savedAt: article.savedAt,
          readAt: article.readAt,
          archivedAt: article.archivedAt,
          tags: article.tags,
          body: article.body,
          cachedAt: new Date().toISOString(),
        }}
      />

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

      <QuickActions
        articleId={article.id}
        articleUrl={article.url}
        initialArchived={article.archivedAt !== null}
        initialRead={article.readAt !== null}
      />
    </main>
  );
}
