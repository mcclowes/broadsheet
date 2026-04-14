import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { listArticles, type ArticleSummary } from "@/lib/articles";
import { listAllAnnotations, type ArticleAnnotations } from "@/lib/annotations";
import { authedUserId } from "@/lib/auth-types";
import { PaletteTrigger } from "@/app/components/palette-trigger";
import { PrimaryTabs } from "@/app/components/primary-tabs";
import { PublicationIcon } from "@/components/publication-icon";
import styles from "./annotations.module.scss";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function AnnotationsPage() {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
  const userId = authedUserId(rawUserId);

  const [annotations, articles] = await Promise.all([
    listAllAnnotations(userId),
    listArticles(userId, {}),
  ]);

  const articleById = new Map<string, ArticleSummary>(
    articles.map((a) => [a.id, a]),
  );

  const totalHighlights = annotations.reduce(
    (n, a) => n + a.highlights.length + a.unanchoredHighlights.length,
    0,
  );

  return (
    <main className={styles.main}>
      <h1 className="srOnly">Annotations</h1>

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <div className={styles.headerActions}>
          <PaletteTrigger />
          <UserButton />
        </div>
      </header>

      <PrimaryTabs active="annotations" />

      <p className={styles.summary}>
        {totalHighlights === 0
          ? "No highlights yet. Select text while reading to create one."
          : `${totalHighlights} highlight${totalHighlights === 1 ? "" : "s"} across ${annotations.length} article${annotations.length === 1 ? "" : "s"}.`}
      </p>

      {annotations.length === 0 ? null : (
        <ol className={styles.groups}>
          {annotations.map((group) => (
            <AnnotationGroup
              key={group.articleId}
              group={group}
              article={articleById.get(group.articleId) ?? null}
            />
          ))}
        </ol>
      )}
    </main>
  );
}

function AnnotationGroup({
  group,
  article,
}: {
  group: ArticleAnnotations;
  article: ArticleSummary | null;
}) {
  const articleHref = `/read/${group.articleId}`;
  const title = article?.title ?? "Untitled article";

  return (
    <li className={styles.group}>
      <header className={styles.groupHeader}>
        <h2 className={styles.groupTitle}>
          <Link href={articleHref} className={styles.groupTitleLink}>
            {title}
          </Link>
        </h2>
        <div className={styles.groupMeta}>
          {article?.source ? (
            <span className={styles.source}>
              <PublicationIcon url={article.url} />
              {article.source}
            </span>
          ) : null}
          <span>Updated {formatDate(group.updatedAt)}</span>
        </div>
      </header>

      <ul className={styles.highlights}>
        {group.highlights.map((h) => (
          <li key={h.id} className={styles.highlight} data-color={h.color}>
            <blockquote className={styles.quote}>{h.text}</blockquote>
            {h.note ? <p className={styles.note}>{h.note}</p> : null}
            <div className={styles.highlightMeta}>
              <span>{formatDate(h.createdAt)}</span>
              <Link href={articleHref} className={styles.openLink}>
                Open article →
              </Link>
            </div>
          </li>
        ))}
        {group.unanchoredHighlights.map((h) => (
          <li key={h.id} className={styles.highlight} data-unanchored="true">
            <blockquote className={styles.quote}>{h.text}</blockquote>
            {h.note ? <p className={styles.note}>{h.note}</p> : null}
            <div className={styles.highlightMeta}>
              <span>{formatDate(h.createdAt)}</span>
              {h.source === "pocket" ? (
                <span className={styles.badge}>From Pocket</span>
              ) : null}
              <Link href={articleHref} className={styles.openLink}>
                Open article →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}
