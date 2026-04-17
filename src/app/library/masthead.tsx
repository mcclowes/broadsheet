import styles from "./library.module.scss";

export interface MastheadCounts {
  unread: number;
  reading: number;
  read: number;
  archive: number;
}

export function Masthead({ counts }: { counts: MastheadCounts }) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className={styles.masthead} aria-labelledby="masthead-title">
      <p className={styles.mastheadDateline}>
        <time>{today}</time> · Your library
      </p>
      <h1 id="masthead-title" className={styles.mastheadTitle}>
        The Collected
      </h1>
      <p className={styles.mastheadSubtitle}>
        &ldquo;Every piece you&rsquo;ve meant to get to.&rdquo;
      </p>
      <dl className={styles.mastheadStats}>
        <Stat label="On the wire" value={counts.unread} />
        <Stat label="Reading" value={counts.reading} accent />
        <Stat label="Filed" value={counts.read} />
        <Stat label="Archived" value={counts.archive} />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={accent ? styles.statValueAccent : styles.statValue}>
        {value}
      </dd>
    </div>
  );
}
