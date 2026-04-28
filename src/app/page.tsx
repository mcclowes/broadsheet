import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { listArticles, type ArticleSummary } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { PaletteTrigger } from "./components/palette-trigger";
import { UserMenu } from "./components/user-menu";
import styles from "./page.module.scss";

// No force-dynamic needed — auth() already makes this page dynamic.
// The unauthenticated landing is static HTML but is fast enough as a
// dynamic render. If TTFB becomes an issue, split the landing into a
// separate static route.

function formatEditionDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function storyMeta(a: ArticleSummary): string {
  const parts = [formatShortDate(a.savedAt), `${a.readMinutes} min read`];
  return parts.join(" · ");
}

export default async function HomePage() {
  const { userId: rawUserId } = await auth();

  if (!rawUserId) {
    return (
      <main className={styles.landing}>
        <header className={styles.landingMasthead}>
          <div className={styles.landingMastheadTop}>
            <span className={styles.landingCorner}>Est. 2025</span>
            <h1 className={styles.landingTitle}>Broadsheet</h1>
            <div className={styles.auth}>
              <SignInButton mode="modal" forceRedirectUrl="/library">
                <button className={styles.authButton}>Sign in</button>
              </SignInButton>
            </div>
          </div>
          <p className={styles.landingMotto}>
            &ldquo;All the articles worth reading.&rdquo;
          </p>
        </header>

        <section className={styles.hero}>
          <h2 className={styles.heroHeadline}>
            Your articles, without the noise
          </h2>
          <p className={styles.heroSub}>
            Save articles from across the web. Read them in a clean,
            distraction-free format. Keep them in your personal library forever.
          </p>
          <div className={styles.heroCta}>
            <SignInButton mode="modal" forceRedirectUrl="/library">
              <button className={styles.ctaButton}>
                Get started &mdash; it&apos;s free
              </button>
            </SignInButton>
          </div>
        </section>

        <section className={styles.features}>
          <div className={styles.feature}>
            <h3 className={styles.featureKicker}>Save</h3>
            <p className={styles.featureHeadline}>
              One click from your browser
            </p>
            <p className={styles.featureDesc}>
              The Chrome extension saves any article to your personal library
              instantly. No copying links, no emailing yourself.
            </p>
          </div>
          <div className={styles.feature}>
            <h3 className={styles.featureKicker}>Read</h3>
            <p className={styles.featureHeadline}>Just the words</p>
            <p className={styles.featureDesc}>
              Articles are stripped of ads, pop-ups, and clutter. Beautiful
              typography, clean layout, no distractions.
            </p>
          </div>
          <div className={styles.feature}>
            <h3 className={styles.featureKicker}>Keep</h3>
            <p className={styles.featureHeadline}>Your library, forever</p>
            <p className={styles.featureDesc}>
              Articles are parsed and stored so they&apos;re always available —
              even if the original disappears from the web.
            </p>
          </div>
        </section>

        <section className={styles.readerPreview} aria-label="Reader preview">
          <h3 className={styles.sectionRule}>The reader view</h3>
          <div className={styles.previewFrame}>
            <div className={styles.previewChrome}>
              <span className={styles.previewDot} />
              <span className={styles.previewDot} />
              <span className={styles.previewDot} />
            </div>
            <article className={styles.previewArticle}>
              <p className={styles.previewKicker}>The New Yorker</p>
              <h4 className={styles.previewHeadline}>
                The quiet craft of reading well
              </h4>
              <p className={styles.previewByline}>By Jane Doe · 8 min read</p>
              <p className={styles.previewBody}>
                For all the devices that demand our attention, the act of
                reading remains stubbornly analogue. A paragraph is still a
                paragraph. A good sentence, typeset with care, does the work it
                has always done — it carries an idea from one mind to another.
              </p>
              <p className={styles.previewBody}>
                Broadsheet strips away everything that isn&apos;t the article.
                What&apos;s left is typography, whitespace, and the piece
                itself.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.howItWorks}>
          <h3 className={styles.sectionRule}>How it works</h3>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNumber}>1</span>
              <div>
                <p className={styles.stepTitle}>Install the extension</p>
                <p className={styles.stepDesc}>
                  Add the Chrome extension to your browser.
                </p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber}>2</span>
              <div>
                <p className={styles.stepTitle}>Save what you find</p>
                <p className={styles.stepDesc}>
                  Click the Broadsheet icon on any article you want to read
                  later.
                </p>
              </div>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <div>
                <p className={styles.stepTitle}>Read on your terms</p>
                <p className={styles.stepDesc}>
                  Open your library anytime. Your articles, cleaned up and
                  waiting.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.bottomCta}>
          <p className={styles.bottomTagline}>
            The reading list that respects your attention.
          </p>
          <SignInButton mode="modal" forceRedirectUrl="/library">
            <button className={styles.ctaButton}>Start reading</button>
          </SignInButton>
        </section>

        <footer className={styles.landingFooter}>
          <p>
            Free and open source &middot;{" "}
            <a
              href="https://github.com/mcclowes/broadsheet/issues"
              rel="noreferrer"
            >
              Feedback &amp; issues
            </a>
          </p>
        </footer>
      </main>
    );
  }

  const userId = authedUserId(rawUserId);
  const articles = await listArticles(userId, {
    view: "inbox",
    state: "unread",
    limit: 17,
  });
  const lead = articles[0];
  const secondary = articles.slice(1, 5);
  const wire = articles.slice(5, 17);
  const today = formatEditionDate(new Date());
  const storyCount = articles.length;

  return (
    <main className={styles.paper}>
      <header className={styles.masthead}>
        <div className={styles.mastheadTop}>
          <span className={styles.mastheadCorner}>Vol. I</span>
          <h1 className={styles.mastheadTitle}>Broadsheet</h1>
          <div className={styles.auth}>
            <PaletteTrigger />
            <Link href="/library" className={styles.authLink}>
              Library
            </Link>
            <UserMenu />
          </div>
        </div>
        <p className={styles.mastheadTagline}>
          &ldquo;All the articles worth reading.&rdquo;
        </p>
        <div className={styles.editionBar}>
          <span>{today}</span>
          <span className={styles.editionCenter}>Your daily edition</span>
          <span>
            {storyCount} {storyCount === 1 ? "story" : "stories"} on the wire
          </span>
        </div>
      </header>

      {storyCount === 0 ? (
        <section className={styles.empty}>
          <p>
            No stories on the wire. Head to your{" "}
            <Link href="/library">library</Link> to save your first article.
          </p>
        </section>
      ) : (
        <>
          {lead ? (
            <section className={styles.leadRow}>
              <article className={styles.lead}>
                <Link href={`/read/${lead.id}`} className={styles.leadLink}>
                  {lead.source ? (
                    <span className={styles.kicker}>{lead.source}</span>
                  ) : null}
                  <h2 className={styles.leadHeadline}>{lead.title}</h2>
                  {lead.byline ? (
                    <p className={styles.byline}>By {lead.byline}</p>
                  ) : null}
                  {lead.excerpt ? (
                    <p className={styles.leadExcerpt}>{lead.excerpt}</p>
                  ) : null}
                  <p className={styles.leadMeta}>{storyMeta(lead)}</p>
                </Link>
              </article>
            </section>
          ) : null}

          {secondary.length > 0 ? (
            <section className={styles.secondaryRow}>
              {secondary.map((a) => (
                <article key={a.id} className={styles.secondary}>
                  <Link href={`/read/${a.id}`} className={styles.secondaryLink}>
                    {a.source ? (
                      <span className={styles.kicker}>{a.source}</span>
                    ) : null}
                    <h3 className={styles.secondaryHeadline}>{a.title}</h3>
                    {a.excerpt ? (
                      <p className={styles.secondaryExcerpt}>{a.excerpt}</p>
                    ) : null}
                    <p className={styles.secondaryMeta}>{storyMeta(a)}</p>
                  </Link>
                </article>
              ))}
            </section>
          ) : null}

          {wire.length > 0 ? (
            <section className={styles.wire}>
              <h4 className={styles.wireTitle}>More from the wire</h4>
              <ul className={styles.wireList}>
                {wire.map((a) => (
                  <li key={a.id} className={styles.wireItem}>
                    <Link href={`/read/${a.id}`} className={styles.wireLink}>
                      <h5 className={styles.wireHeadline}>{a.title}</h5>
                      <p className={styles.wireMeta}>
                        {a.source ? `${a.source} · ` : ""}
                        {storyMeta(a)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
