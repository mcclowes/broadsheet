import Link from "next/link";
import { Skeleton } from "@/components/skeleton";
import styles from "./read.module.scss";
import loadingStyles from "./loading.module.scss";

export default function ReadLoading() {
  return (
    <main className={styles.main} aria-busy="true" aria-live="polite">
      <span className="srOnly" role="status">
        Loading article…
      </span>

      <nav className={styles.nav}>
        <Link href="/library" className={styles.back}>
          ← Library
        </Link>
      </nav>

      <header className={styles.header}>
        <Skeleton
          width="90%"
          height="2.5rem"
          style={{ marginBottom: "0.75rem" }}
        />
        <Skeleton
          width="60%"
          height="2.5rem"
          style={{ marginBottom: "1rem" }}
        />
        <div className={loadingStyles.metaRow}>
          <Skeleton width="7rem" height="0.875rem" />
          <Skeleton width="5rem" height="0.875rem" />
          <Skeleton width="4.5rem" height="0.875rem" />
        </div>
      </header>

      <div className={loadingStyles.body} aria-hidden="true">
        <Skeleton width="100%" height="1.1875rem" />
        <Skeleton width="97%" height="1.1875rem" />
        <Skeleton width="94%" height="1.1875rem" />
        <Skeleton width="60%" height="1.1875rem" />
        <div className={loadingStyles.spacer} />
        <Skeleton width="100%" height="1.1875rem" />
        <Skeleton width="95%" height="1.1875rem" />
        <Skeleton width="98%" height="1.1875rem" />
        <Skeleton width="80%" height="1.1875rem" />
        <Skeleton width="45%" height="1.1875rem" />
        <div className={loadingStyles.spacer} />
        <Skeleton width="99%" height="1.1875rem" />
        <Skeleton width="92%" height="1.1875rem" />
        <Skeleton width="70%" height="1.1875rem" />
      </div>
    </main>
  );
}
