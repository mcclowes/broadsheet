import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { authedUserId } from "@/lib/auth-types";
import { DigestSettings } from "./digest-settings";
import { AutoArchiveSettings } from "./auto-archive-settings";
import styles from "./settings.module.scss";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
  // We don't currently need userId on this page — settings are read/written
  // by client-side API calls that re-derive it from `auth()` themselves.
  // The redirect above is enough to gate access.
  authedUserId(rawUserId);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <UserButton />
      </header>

      <nav className={styles.tabs} aria-label="Primary">
        <Link href="/library" className={styles.tab}>
          Library
        </Link>
        <Link href="/sources" className={styles.tab}>
          Sources
        </Link>
        <Link href="/settings" className={styles.tabActive}>
          Settings
        </Link>
      </nav>

      <h1 className={styles.pageTitle}>Settings</h1>

      <section className={styles.section} aria-labelledby="import-heading">
        <h2 id="import-heading" className={styles.sectionTitle}>
          Import
        </h2>
        <p className={styles.sectionIntro}>
          Bring your saved articles in from other read-it-later services.
        </p>
        <Link href="/import/pocket" className={styles.digestButton}>
          Import from Pocket
        </Link>
      </section>

      <section
        className={styles.section}
        aria-labelledby="auto-archive-heading"
      >
        <h2 id="auto-archive-heading" className={styles.sectionTitle}>
          Auto-archive
        </h2>
        <p className={styles.sectionIntro}>
          Keep your inbox tidy by archiving older articles automatically.
        </p>
        <AutoArchiveSettings />
      </section>

      <section className={styles.section} aria-labelledby="digest-heading">
        <h2 id="digest-heading" className={styles.sectionTitle}>
          Daily digest
        </h2>
        <p className={styles.sectionIntro}>
          A morning email summarising what&rsquo;s new across your sources.
        </p>
        <DigestSettings />
      </section>
    </main>
  );
}
