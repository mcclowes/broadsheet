import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import { renderMarkdown } from "@/lib/markdown";
import { listHighlights } from "@/lib/highlights";
import { listAnnotations } from "@/lib/annotations";
import { listCollectionsForArticle } from "@/lib/collections";
import { ArticleActions } from "./article-actions";
import { ReaderFeatures } from "./reader-features";
import { CollectionPicker } from "./collection-picker";
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

  const [highlights, annotations, articleCollections] = await Promise.all([
    listHighlights(userId, id),
    listAnnotations(userId, id),
    listCollectionsForArticle(userId, id),
  ]);

  const html = renderMarkdown(article.body);

  return (
    <main className={styles.main}>
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
        </div>
        <ArticleActions
          articleId={article.id}
          initialTags={article.tags}
          initialArchived={article.archivedAt !== null}
          initialRead={article.readAt !== null}
        />
        <CollectionPicker
          articleId={article.id}
          initialCollections={articleCollections.map((c) => ({
            id: c.id,
            name: c.name,
          }))}
        />
      </header>

      <ReaderFeatures
        articleId={article.id}
        articleBody={article.body}
        html={html}
        initialHighlights={highlights}
        initialAnnotations={annotations}
      />
    </main>
  );
}
