import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestUserId } from "@/lib/preview-mode";
import { DigestSettings } from "./digest-settings";
import { AuthUserButton } from "@/components/auth-chrome";
import styles from "./settings.module.scss";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await getRequestUserId();
  if (!userId) redirect("/sign-in");
  // We don't currently need userId on this page — settings are read/written
  // by client-side API calls that re-derive it from `auth()` themselves.
  // The redirect above is enough to gate access.

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Broadsheet
        </Link>
        <AuthUserButton />
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
