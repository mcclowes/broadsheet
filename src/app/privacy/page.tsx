import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.scss";

export const metadata: Metadata = {
  title: "Privacy policy — Broadsheet",
  description:
    "How the Broadsheet web app and Chrome extension handle your data.",
};

const LAST_UPDATED = "2026-04-11";

export default function PrivacyPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Broadsheet
        </Link>
      </header>

      <article className={styles.article}>
        <h1 className={styles.title}>Privacy policy</h1>
        <p className={styles.meta}>Last updated: {LAST_UPDATED}</p>

        <p>
          Broadsheet is a read-it-later app. You save articles from the web, and
          we store them in a per-user library so you can read them later. This
          policy covers both the Broadsheet web app and the Broadsheet Chrome
          extension (the &ldquo;service&rdquo;).
        </p>

        <h2>Account data</h2>
        <p>
          Authentication is handled by{" "}
          <a href="https://clerk.com" rel="noreferrer">
            Clerk
          </a>
          . When you sign in, Clerk stores the identifiers you provide (email
          address and, if you use a social login, the provider&rsquo;s user ID).
          Broadsheet only receives a stable user ID from Clerk and uses it to
          scope your library to your account.
        </p>

        <h2>Article data</h2>
        <p>
          When you save a URL, Broadsheet fetches the page (or receives the
          rendered HTML from the Chrome extension), parses it into clean
          Markdown with{" "}
          <a href="https://github.com/mozilla/readability" rel="noreferrer">
            Mozilla Readability
          </a>
          , and stores the result in a per-user volume. Stored fields include
          the article title, author, canonical URL, saved-at timestamp, tags,
          read state, and the Markdown body.
        </p>
        <p>
          Storage uses{" "}
          <a href="https://vercel.com/storage/blob" rel="noreferrer">
            Vercel Blob
          </a>{" "}
          in production. Only you (and the Broadsheet operator, for operational
          reasons such as debugging a failed save) can access the contents of
          your library.
        </p>

        <h2>Chrome extension</h2>
        <p>
          The Broadsheet Chrome extension is a thin client for this web app.
          When you click the toolbar icon, press the save shortcut, or click{" "}
          <strong>Save this tab</strong> in the popup, the extension reads:
        </p>
        <ul>
          <li>
            The <strong>URL</strong> of the active tab.
          </li>
          <li>
            The <strong>rendered HTML</strong> of the active tab (
            <code>document.documentElement.outerHTML</code>), captured via{" "}
            <code>chrome.scripting.executeScript</code>. This lets Broadsheet
            save paywalled or client-rendered pages that the server
            couldn&rsquo;t otherwise fetch.
          </li>
        </ul>
        <p>
          The extension also reads and writes a single preference in{" "}
          <code>chrome.storage.sync</code>: <code>baseUrl</code>, the Broadsheet
          instance the extension should talk to. It defaults to the production
          URL and can be changed via the options page (for example, to point at
          a local dev server).
        </p>
        <p>
          No other tab content, browsing history, form data, or telemetry is
          collected. On save, the extension sends an HTTPS <code>POST</code> to{" "}
          <code>{"${baseUrl}/api/articles"}</code> with a JSON body containing
          the URL and (when available) the rendered HTML. Authentication uses
          the browser&rsquo;s existing cookie session with your Broadsheet
          account &mdash; the extension never stores, reads, or forwards
          credentials itself.
        </p>

        <h2>What we don&rsquo;t do</h2>
        <ul>
          <li>No third-party analytics or tracking pixels.</li>
          <li>No advertising.</li>
          <li>
            No selling, renting, or sharing of your data with third parties.
          </li>
          <li>
            No contact with hosts other than the configured Broadsheet instance
            (from the extension).
          </li>
        </ul>

        <h2>Permission rationale (extension)</h2>
        <ul>
          <li>
            <code>activeTab</code> + <code>scripting</code> &mdash; read the URL
            and rendered HTML of the tab you explicitly act on. Only triggered
            by a user gesture (click or keyboard shortcut).
          </li>
          <li>
            <code>storage</code> &mdash; persist the <code>baseUrl</code>{" "}
            preference across browser restarts.
          </li>
          <li>
            <code>notifications</code> &mdash; show a toast when a save succeeds
            or fails.
          </li>
          <li>
            Host permission for{" "}
            <code>https://broadsheet.marginalutility.dev/*</code> &mdash;
            deliver the save request with the user&rsquo;s existing cookie
            session.
          </li>
          <li>
            Optional host permissions for <code>http://localhost/*</code>,{" "}
            <code>http://127.0.0.1/*</code>, and <code>https://*/*</code>{" "}
            &mdash; requested only if you point the extension at a non-default
            Broadsheet instance via the options page.
          </li>
        </ul>

        <h2>Deletion</h2>
        <p>
          To delete your account and its data, open an issue at{" "}
          <a
            href="https://github.com/mcclowes/broadsheet/issues"
            rel="noreferrer"
          >
            github.com/mcclowes/broadsheet/issues
          </a>
          . Self-service deletion is on the roadmap.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or concerns: open an issue at{" "}
          <a
            href="https://github.com/mcclowes/broadsheet/issues"
            rel="noreferrer"
          >
            github.com/mcclowes/broadsheet/issues
          </a>
          .
        </p>
      </article>
    </main>
  );
}
