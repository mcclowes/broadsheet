import Link from "next/link";
import styles from "./read.module.scss";

export default function ReadLoading() {
  return (
    <main className={styles.main} aria-busy="true">
      <nav className={styles.nav}>
        <Link href="/library" className={styles.back}>
          ← Library
        </Link>
      </nav>
      <header className={styles.header}>
        <h1 className={styles.title}>Loading…</h1>
      </header>
    </main>
  );
}
