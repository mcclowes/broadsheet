import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getCollection } from "@/lib/collections";
import { getArticle } from "@/lib/articles";
import { CollectionActions } from "./collection-actions";
import { ExportPanel } from "../../read/[id]/export-panel";
import styles from "../collections.module.scss";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const collection = await getCollection(userId, id);
  if (!collection) notFound();

  const articles = (
    await Promise.all(
      collection.articleIds.map(async (aid) => {
        const a = await getArticle(userId, aid);
        return a
          ? {
              id: a.id,
              title: a.title,
              source: a.source,
              readMinutes: a.readMinutes,
              url: a.url,
            }
          : null;
      }),
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  return (
    <main className={styles.main}>
      <nav className={styles.nav}>
        <Link href="/collections" className={styles.back}>
          ← Collections
        </Link>
      </nav>

      <h1 className={styles.heading}>{collection.name}</h1>
      {collection.description ? (
        <p className={styles.description}>{collection.description}</p>
      ) : null}

      <CollectionActions collectionId={collection.id} />

      {articles.length === 0 ? (
        <p className={styles.empty}>
          No articles in this collection yet. Add articles from the reader view.
        </p>
      ) : (
        <ul className={styles.list}>
          {articles.map((a) => (
            <li key={a.id} className={styles.item}>
              <Link href={`/read/${a.id}`} className={styles.link}>
                <h2 className={styles.name}>{a.title}</h2>
                <div className={styles.meta}>
                  {a.source ? <span>{a.source}</span> : null}
                  <span>{a.readMinutes} min read</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <ExportPanel articleId="" collectionId={collection.id} />
    </main>
  );
}
