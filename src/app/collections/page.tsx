import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { listCollections } from "@/lib/collections";
import { CreateCollectionForm } from "./create-form";
import styles from "./collections.module.scss";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const collections = await listCollections(userId);

  return (
    <main className={styles.main}>
      <nav className={styles.nav}>
        <Link href="/library" className={styles.back}>
          ← Library
        </Link>
      </nav>

      <h1 className={styles.heading}>Collections</h1>

      <CreateCollectionForm />

      {collections.length === 0 ? (
        <p className={styles.empty}>
          No collections yet. Create one to start organizing your articles.
        </p>
      ) : (
        <ul className={styles.list}>
          {collections.map((c) => (
            <li key={c.id} className={styles.item}>
              <Link href={`/collections/${c.id}`} className={styles.link}>
                <h2 className={styles.name}>{c.name}</h2>
                <div className={styles.meta}>
                  <span>
                    {c.articleIds.length}{" "}
                    {c.articleIds.length === 1 ? "article" : "articles"}
                  </span>
                  {c.description ? <span>{c.description}</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
