import Link from "next/link";
import { Skeleton } from "@/components/skeleton";
import styles from "../sources.module.scss";
import loadingStyles from "../loading.module.scss";

const SKELETON_ITEMS = 6;

export default function SourceDetailLoading() {
  return (
    <main className={styles.main} aria-busy="true" aria-live="polite">
      <span className="srOnly" role="status">
        Loading source…
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

      <header className={styles.perSiteHeader}>
        <Skeleton
          width="60%"
          height="1.75rem"
          style={{ marginBottom: "0.5rem" }}
        />
        <div className={loadingStyles.metaRow}>
          <Skeleton width="8rem" height="0.875rem" />
          <Skeleton width="5rem" height="0.875rem" />
        </div>
      </header>

      <ul className={styles.itemList} aria-hidden="true">
        {Array.from({ length: SKELETON_ITEMS }).map((_, i) => (
          <li key={i} className={styles.item}>
            <Skeleton
              width={i % 2 === 0 ? "85%" : "70%"}
              height="1.25rem"
              style={{ marginBottom: "0.5rem" }}
            />
            <div className={loadingStyles.metaRow}>
              <Skeleton width="4rem" height="0.75rem" />
            </div>
            <Skeleton
              width="100%"
              height="0.9rem"
              style={{ marginTop: "0.5rem", marginBottom: "0.25rem" }}
            />
            <Skeleton width="90%" height="0.9rem" />
          </li>
        ))}
      </ul>
    </main>
  );
}
