import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getArticle } from "@/lib/articles";
import { getRequestUserId } from "@/lib/preview-mode";
import { DiffViewer } from "./diff-viewer";
import styles from "./diff.module.scss";

export const dynamic = "force-dynamic";

export default async function DiffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getRequestUserId();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const article = await getArticle(userId, id);
  if (!article) notFound();

  return (
    <main className={styles.main}>
      <nav className={styles.nav}>
        <Link href={`/read/${id}`} className={styles.back}>
          ← Back to article
        </Link>
      </nav>

      <header className={styles.header}>
        <h1 className={styles.title}>{article.title}</h1>
        <p className={styles.subtitle}>
          Changes since you saved this article on{" "}
          {new Date(article.savedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </header>

      <DiffViewer articleId={id} />
    </main>
  );
}
