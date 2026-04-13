import type { Metadata } from "next";
import Link from "next/link";
import styles from "./help.module.scss";

export const metadata: Metadata = {
  title: "Help & troubleshooting — Broadsheet",
  description:
    "How to save, read, and organise articles in Broadsheet, plus answers to common problems.",
};

export default function HelpPage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Broadsheet
        </Link>
      </header>

      <article className={styles.article}>
        <h1 className={styles.title}>Help & troubleshooting</h1>
        <p>
          Everything you need to get articles into Broadsheet and read them
          later. Can&rsquo;t find what you&rsquo;re after?{" "}
          <a
            href="https://github.com/mcclowes/broadsheet/issues"
            rel="noreferrer"
          >
            Open an issue on GitHub
          </a>
          .
        </p>

        <nav className={styles.toc} aria-label="On this page">
          <ul>
            <li>
              <a href="#getting-started">Getting started</a>
            </li>
            <li>
              <a href="#saving">Saving articles</a>
            </li>
            <li>
              <a href="#extension">Chrome extension</a>
            </li>
            <li>
              <a href="#reading">Reading & organising</a>
            </li>
            <li>
              <a href="#shortcuts">Keyboard shortcuts</a>
            </li>
            <li>
              <a href="#troubleshooting">Troubleshooting</a>
            </li>
            <li>
              <a href="#faq">FAQ</a>
            </li>
          </ul>
        </nav>

        <h2 id="getting-started">Getting started</h2>
        <ol>
          <li>
            Sign in from the <Link href="/">home page</Link>. Broadsheet uses
            Clerk for authentication &mdash; you can use email or a social
            login.
          </li>
          <li>
            Open your <Link href="/library">library</Link>. It&rsquo;ll be empty
            on first visit.
          </li>
          <li>
            Save your first article from the{" "}
            <Link href="/import">import page</Link>, or install the Chrome
            extension for one-click saving.
          </li>
          <li>
            Click any article in the library to read it in a clean,
            distraction-free view.
          </li>
        </ol>

        <h2 id="saving">Saving articles</h2>
        <p>There are three ways to get an article into your library:</p>
        <ul>
          <li>
            <strong>Paste a URL</strong> into the import form at{" "}
            <Link href="/import">/import</Link>. Broadsheet fetches the page
            server-side, extracts the main content, and stores it as Markdown.
          </li>
          <li>
            <strong>Chrome extension</strong>. Click the toolbar icon or use the
            save shortcut to send the current tab to Broadsheet. This path also
            works for paywalled or client-rendered pages the server can&rsquo;t
            reach directly.
          </li>
          <li>
            <strong>Command palette</strong>. Press <kbd>⌘ K</kbd> (or{" "}
            <kbd>Ctrl K</kbd>) anywhere in the app to jump to commands,
            including save.
          </li>
        </ul>
        <p>
          Broadsheet deduplicates by canonical URL &mdash; saving the same
          article twice (even with different tracking parameters) updates the
          existing entry rather than creating a duplicate.
        </p>

        <h2 id="extension">Chrome extension</h2>
        <h3>Install</h3>
        <p>
          The extension lives in <code>apps/extension/</code> in the repo. Until
          it&rsquo;s on the Chrome Web Store, load it as an unpacked extension:
        </p>
        <ol>
          <li>
            Clone the repo and run <code>npm run build</code> inside{" "}
            <code>apps/extension/</code>.
          </li>
          <li>
            Open <code>chrome://extensions</code>, enable{" "}
            <strong>Developer mode</strong>, and click{" "}
            <strong>Load unpacked</strong>.
          </li>
          <li>
            Select the built extension directory. Pin the icon to the toolbar
            for easy access.
          </li>
        </ol>

        <h3>Configure</h3>
        <p>
          The extension talks to the production Broadsheet instance by default.
          To point it at a local dev server or a self-hosted instance,
          right-click the toolbar icon, choose <strong>Options</strong>, and set
          the base URL (e.g. <code>http://localhost:3000</code>).
        </p>

        <h3>Sign in</h3>
        <p>
          The extension reuses your browser&rsquo;s existing Broadsheet cookie
          session. Sign in to the web app first in the same browser profile; the
          extension never handles credentials directly.
        </p>

        <h2 id="reading">Reading & organising</h2>
        <ul>
          <li>
            <strong>Tags</strong>. Add tags from the article view or the row
            menu in the library to group articles by topic.
          </li>
          <li>
            <strong>Read state</strong>. Articles are marked read automatically
            once you&rsquo;ve scrolled through them, or you can toggle it
            manually. The library has separate filters for active items and the
            archive.
          </li>
          <li>
            <strong>Auto-archive</strong>. Configure in{" "}
            <Link href="/settings">settings</Link> to keep the active library
            focused on recent reads.
          </li>
          <li>
            <strong>Digest</strong>. Optional weekly summary of what&rsquo;s
            waiting in your library &mdash; also in{" "}
            <Link href="/settings">settings</Link>.
          </li>
          <li>
            <strong>Sources</strong>. The{" "}
            <Link href="/sources">sources view</Link> groups your library by
            publication so you can focus on one domain at a time.
          </li>
        </ul>

        <h2 id="shortcuts">Keyboard shortcuts</h2>
        <ul>
          <li>
            <kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd> &mdash; open the command palette
          </li>
          <li>
            <kbd>Esc</kbd> &mdash; close any open palette or menu
          </li>
        </ul>

        <h2 id="troubleshooting">Troubleshooting</h2>

        <h3>&ldquo;Couldn&rsquo;t fetch this page&rdquo; when saving a URL</h3>
        <p>The server couldn&rsquo;t reach the page. Common causes:</p>
        <ul>
          <li>
            The site requires JavaScript to render its content &mdash; use the
            Chrome extension instead, which captures the already-rendered HTML.
          </li>
          <li>
            The site is behind a paywall or login wall &mdash; same answer; the
            extension uses your existing browser session.
          </li>
          <li>
            The URL points to a private or local host. Broadsheet blocks fetches
            to internal network ranges for safety.
          </li>
          <li>
            The site took longer than 15 seconds to respond, or the response
            body was larger than 5 MB.
          </li>
        </ul>

        <h3>Extension save fails with 401 or redirects to sign-in</h3>
        <p>
          Your cookie session has expired. Open Broadsheet in a tab, sign in
          again, then retry the save.
        </p>

        <h3>Extension saves to the wrong instance</h3>
        <p>
          Check the base URL in the extension&rsquo;s options page. If
          you&rsquo;ve pointed it at a non-default host, Chrome may prompt for
          optional host permissions the first time.
        </p>

        <h3>Article renders badly or misses content</h3>
        <p>
          The Markdown is produced by Mozilla Readability, which works best on
          article-shaped pages. For listicles, forums, or heavily-custom layouts
          the extraction can drop sections. If you&rsquo;re consistently seeing
          a bad render for a domain, open an issue with the URL.
        </p>

        <h3>I saved an article twice and only see one entry</h3>
        <p>
          Working as intended &mdash; Broadsheet deduplicates by canonical URL.
          The second save updates the existing entry rather than creating a
          duplicate.
        </p>

        <h2 id="faq">FAQ</h2>

        <h3>Where is my data stored?</h3>
        <p>
          In a per-user volume on Vercel Blob in production. See the{" "}
          <Link href="/privacy">privacy policy</Link> for the full breakdown.
        </p>

        <h3>Can I export my library?</h3>
        <p>
          Not yet via a UI. The underlying storage is plain Markdown with YAML
          frontmatter, so export is on the roadmap. Open an issue if you need it
          sooner.
        </p>

        <h3>Can I delete my account?</h3>
        <p>
          Yes &mdash; open an issue and the operator will remove your volume.
          Self-service deletion is on the roadmap.
        </p>

        <h3>Is there a mobile app?</h3>
        <p>
          Not yet. The web app works on mobile browsers; a native app and
          iOS/Android share sheets are tracked in{" "}
          <a
            href="https://github.com/mcclowes/broadsheet/issues"
            rel="noreferrer"
          >
            GitHub issues
          </a>
          .
        </p>

        <h3>Where do I report a bug or request a feature?</h3>
        <p>
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
