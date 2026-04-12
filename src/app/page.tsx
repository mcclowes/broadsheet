import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { listArticles, type ArticleSummary } from "@/lib/articles";
import {
  generatePoem,
  generateWordScrambles,
  generateQuiz,
} from "@/lib/diversions";
import { WordGame } from "./components/word-game";
import { MiniQuiz } from "./components/mini-quiz";
import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

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
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className={styles.landing}>
        <header className={styles.landingHeader}>
          <h1 className={styles.landingTitle}>Broadsheet</h1>
          <div className={styles.auth}>
            <SignInButton mode="modal" />
          </div>
        </header>
        <section className={styles.tagline}>
          <p>Save articles. Read them cleanly. Keep them.</p>
        </section>
      </main>
    );
  }

  const articles = await listArticles(userId, { view: "inbox" });
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
            <Link href="/library" className={styles.authLink}>
              Library
            </Link>
            <UserButton />
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

          {storyCount >= 10 ? <Diversions articles={articles} /> : null}
        </>
      )}
    </main>
  );
}

function Diversions({ articles }: { articles: ArticleSummary[] }) {
  const poem = generatePoem(articles);
  const scrambles = generateWordScrambles(articles);
  const quiz = generateQuiz(articles);

  return (
    <section className={styles.diversions}>
      <h4 className={styles.diversionsTitle}>Diversions</h4>
      <div className={styles.diversionsGrid}>
        <div className={styles.diversionCard}>
          <h4 className={styles.diversionTitle}>{poem.title}</h4>
          <p className={styles.diversionIntro}>
            Composed from today&rsquo;s headlines.
          </p>
          <ul className={styles.poemLines}>
            {poem.lines.map((line, i) =>
              line === "" ? (
                <li key={i} className={styles.poemBreak} aria-hidden="true" />
              ) : (
                <li key={i} className={styles.poemLine}>
                  {line}
                </li>
              ),
            )}
          </ul>
        </div>

        {scrambles.length > 0 ? <WordGame scrambles={scrambles} /> : null}

        {quiz.length > 0 ? <MiniQuiz questions={quiz} /> : null}
      </div>
    </section>
  );
}
