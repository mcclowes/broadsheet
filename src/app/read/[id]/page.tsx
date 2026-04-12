import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import { renderMarkdown } from "@/lib/markdown";
import { ArticleActions } from "./article-actions";
import { CacheArticle } from "./cache-article";
import styles from "./read.module.scss";

export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const article = await getArticle(userId, id);
  if (!article) notFound();

  const html = renderMarkdown(article.body);

  return (
    <main className={styles.main}>
      <CacheArticle
        article={{
          id: article.id,
          title: article.title,
          url: article.url,
          source: article.source,
          byline: article.byline,
          excerpt: article.excerpt,
          lang: article.lang,
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

      <nav className={styles.nav}>
        <Link href="/library" className={styles.back}>
          ← Library
        </Link>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>{article.title}</h1>
        <div className={styles.meta}>
          {article.byline ? <span>{article.byline}</span> : null}
          {article.source ? <span>{article.source}</span> : null}
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

      <article
        className="reader-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
