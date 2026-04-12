import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { authedUserId } from "@/lib/auth-types";
import { PocketImportForm } from "./import-form";
import styles from "./import.module.scss";

export const dynamic = "force-dynamic";

export default async function PocketImportPage() {
  const { userId: rawUserId } = await auth();
  if (!rawUserId) redirect("/sign-in");
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
        <Link href="/settings" className={styles.tab}>
          Settings
        </Link>
      </nav>

      <h1 className={styles.pageTitle}>Import from Pocket</h1>

      <section className={styles.section}>
        <p className={styles.intro}>
          Request an export from{" "}
          <a
            href="https://getpocket.com/export"
            target="_blank"
            rel="noreferrer"
          >
            Pocket
          </a>
          . When it arrives, upload the <code>part_000000.csv</code> and
          (optionally) <code>annotations/part_000000.json</code> files below.
        </p>
        <p className={styles.intro}>
          Articles are imported as stubs — the full text is fetched the first
          time you open each one. Highlights from Pocket are attached to their
          articles as unanchored notes.
        </p>
        <PocketImportForm />
      </section>
    </main>
  );
}
