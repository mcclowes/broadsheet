import styles from "./library.module.scss";

export default function LibraryLoading() {
  return (
    <main className={styles.main} aria-busy="true">
      <header className={styles.header}>
        <span className={styles.brand}>Broadsheet</span>
      </header>
      <p className={styles.empty}>Loading library…</p>
    </main>
  );
}
