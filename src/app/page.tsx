import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import styles from "./page.module.scss";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Broadsheet</h1>
        <div className={styles.auth}>
          <Show when="signed-out">
            <SignInButton mode="modal" />
          </Show>
          <Show when="signed-in">
            <Link href="/library">Library</Link>
            <UserButton />
          </Show>
        </div>
      </header>

      <section className={styles.tagline}>
        <p>Save articles. Read them cleanly. Keep them.</p>
        <Show when="signed-in">
          <Link className={styles.cta} href="/library">
            Open your library →
          </Link>
        </Show>
      </section>
    </main>
  );
}
