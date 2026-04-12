import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { ArticleActions } from "./article-actions";
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
  const article = await getArticle(userId, id);
  if (!article) notFound();

  // Body is canonical sanitised HTML since issue #6 — render directly.
  const html = article.body;

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
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer noopener"
            className={styles.originalLink}
          >
            Original
          </a>
          <Link href={`/read/${id}/diff`} className={styles.originalLink}>
            Check for changes
          </Link>
        </div>
        <ArticleActions
          articleId={article.id}
          initialTags={article.tags}
          initialArchived={article.archivedAt !== null}
          initialRead={article.readAt !== null}
        />
      </header>

      <ReadTracker
        articleId={article.id}
        alreadyRead={article.readAt !== null}
      />

      <article
        className="reader-body"
        dangerouslySetInnerHTML={{ __html: html }}
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
