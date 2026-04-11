import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { listArticles } from "@/lib/articles";
import { SaveForm } from "./save-form";
import styles from "./library.module.scss";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const articles = await listArticles(userId);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <UserButton />
      </header>

      <SaveForm />

      {articles.length === 0 ? (
        <p className={styles.empty}>
          Nothing saved yet. Paste a URL above to save your first article.
        </p>
      ) : (
        <ul className={styles.list}>
          {articles.map((a) => (
            <li key={a.id} className={styles.item}>
              <Link href={`/read/${a.id}`} className={styles.link}>
                <h2 className={styles.title}>{a.title}</h2>
                <div className={styles.meta}>
                  {a.source ? <span>{a.source}</span> : null}
                  <span>{a.readMinutes} min read</span>
                  {a.readAt ? <span className={styles.read}>Read</span> : null}
                </div>
                {a.excerpt ? <p className={styles.excerpt}>{a.excerpt}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
