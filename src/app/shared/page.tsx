import { Suspense } from "react";
import SharedContent from "./shared-content";
import styles from "./shared.module.scss";

export default function SharedPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.main}>
          <h1 className={styles.brand}>Broadsheet</h1>
          <div className={styles.status}>
            <p className={styles.message}>Loading&hellip;</p>
          </div>
        </main>
      }
    >
      <SharedContent />
    </Suspense>
  );
}
