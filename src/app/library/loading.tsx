import { Skeleton } from "@/components/skeleton";
import styles from "./library.module.scss";
import loadingStyles from "./loading.module.scss";

const SKELETON_ITEMS = 6;

export default function LibraryLoading() {
  return (
    <main className={styles.main} aria-busy="true" aria-live="polite">
      <span className="srOnly" role="status">
        Loading library…
      </span>

      <header className={styles.header}>
        <span className={styles.brand}>Broadsheet</span>
        <div className={styles.headerActions}>
          <Skeleton width={32} height={32} circle />
          <Skeleton width={32} height={32} circle />
          <Skeleton width={32} height={32} circle />
        </div>
      </header>

      <nav className={styles.topTabs} aria-hidden="true">
        <div className={styles.topTabsLeft}>
          <Skeleton width="4.5rem" height="1.75rem" radius="999px" />
          <Skeleton width="5rem" height="1.75rem" radius="999px" />
          <Skeleton width="5rem" height="1.75rem" radius="999px" />
        </div>
        <Skeleton width="6rem" height="1.5rem" radius="999px" />
      </nav>

      <div className={styles.filters} aria-hidden="true">
        <div className={styles.filterGroup}>
          <Skeleton width="3.5rem" height="1.5rem" radius="999px" />
          <Skeleton width="4rem" height="1.5rem" radius="999px" />
        </div>
        <div className={styles.filterGroup}>
          <Skeleton width="3rem" height="1.5rem" radius="999px" />
          <Skeleton width="4rem" height="1.5rem" radius="999px" />
          <Skeleton width="3.5rem" height="1.5rem" radius="999px" />
        </div>
      </div>

      <ul className={styles.list} aria-hidden="true">
        {Array.from({ length: SKELETON_ITEMS }).map((_, i) => (
          <li key={i} className={styles.item}>
            <div className={loadingStyles.skeletonItem}>
              <Skeleton
                width={i % 3 === 0 ? "90%" : "70%"}
                height="1.4rem"
                style={{ marginBottom: "0.5rem" }}
              />
              <div className={loadingStyles.metaRow}>
                <Skeleton width="6rem" height="0.8125rem" />
                <Skeleton width="4rem" height="0.8125rem" />
              </div>
              <Skeleton
                width="100%"
                height="0.9rem"
                style={{ marginBottom: "0.25rem" }}
              />
              <Skeleton width="85%" height="0.9rem" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
