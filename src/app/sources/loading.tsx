import Link from "next/link";
import { Skeleton } from "@/components/skeleton";
import styles from "./sources.module.scss";
import loadingStyles from "./loading.module.scss";

const SKELETON_SOURCES = 4;
const SKELETON_ITEMS = 5;

export default function SourcesLoading() {
  return (
    <main className={styles.main} aria-busy="true" aria-live="polite">
      <span className="srOnly" role="status">
        Loading sources…
      </span>

      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <Skeleton width={32} height={32} circle />
      </header>

      <nav className={styles.tabs} aria-hidden="true">
        <Skeleton width="5rem" height="1.75rem" radius="999px" />
        <Skeleton width="5rem" height="1.75rem" radius="999px" />
        <Skeleton width="5rem" height="1.75rem" radius="999px" />
      </nav>

      <p className={styles.intro}>
        Follow a site to see its latest articles here. Nothing is saved to your
        library until you tap save — this is a magazine rack, not an inbox.
      </p>

      <ul className={styles.sourceList} aria-hidden="true">
        {Array.from({ length: SKELETON_SOURCES }).map((_, i) => (
          <li key={i}>
            <div className={styles.sourceCard}>
              <div style={{ width: "100%" }}>
                <Skeleton
                  width="70%"
                  height="1rem"
                  style={{ marginBottom: "0.375rem" }}
                />
                <Skeleton width="50%" height="0.75rem" />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ul className={styles.itemList} aria-hidden="true">
        {Array.from({ length: SKELETON_ITEMS }).map((_, i) => (
          <li key={i} className={styles.item}>
            <Skeleton
              width={i % 2 === 0 ? "80%" : "65%"}
              height="1.25rem"
              style={{ marginBottom: "0.5rem" }}
            />
            <div className={loadingStyles.metaRow}>
              <Skeleton width="5rem" height="0.75rem" />
              <Skeleton width="3.5rem" height="0.75rem" />
            </div>
            <Skeleton
              width="100%"
              height="0.9rem"
              style={{ marginTop: "0.5rem", marginBottom: "0.25rem" }}
            />
            <Skeleton width="85%" height="0.9rem" />
          </li>
        ))}
      </ul>
    </main>
  );
}
