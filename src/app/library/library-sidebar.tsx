import Link from "next/link";
import {
  computeSourceStats,
  computeTagStats,
  computeWeekStats,
  formatRemaining,
} from "@/lib/library-stats";
import type { ArticleSummary } from "@/lib/articles";
import { SourceMark } from "@/components/source-mark";
import { filterLink, type CurrentFilters } from "./filters";
import styles from "./library-sidebar.module.scss";

interface Props {
  articles: ArticleSummary[];
  current: CurrentFilters;
}

export function LibrarySidebar({ articles, current }: Props) {
  const tags = computeTagStats(articles);
  const sources = computeSourceStats(articles);
  const week = computeWeekStats(articles);

  const peak = Math.max(1, ...week.days.map((d) => d.saved));
  const todayDate = new Date().toISOString().slice(0, 10);

  return (
    <aside className={styles.sidebar} aria-label="Library overview">
      {tags.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tags</h2>
          <ul className={styles.tagList}>
            {tags.map((t) => {
              const isActive = current.tag === t.name;
              return (
                <li key={t.name}>
                  <Link
                    href={filterLink(current, {
                      tag: isActive ? null : t.name,
                    })}
                    className={isActive ? styles.tagPillActive : styles.tagPill}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span>#{t.name}</span>
                    <span className={styles.tagCount}>{t.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {sources.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Sources</h2>
          <ul className={styles.sourceList}>
            {sources.map((s) => {
              const isActive = current.source === s.name;
              return (
                <li key={s.name}>
                  <Link
                    href={filterLink(current, {
                      source: isActive ? null : s.name,
                    })}
                    className={
                      isActive ? styles.sourceItemActive : styles.sourceItem
                    }
                    aria-current={isActive ? "true" : undefined}
                  >
                    <SourceMark source={s.name} size="sm" />
                    <span className={styles.sourceName}>{s.name}</span>
                    <span className={styles.sourceCount}>{s.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>This week</h2>
        <div
          className={styles.chart}
          role="img"
          aria-label={`${week.saved} saved, ${week.read} read this week`}
        >
          {week.days.map((d) => {
            const heightPct = Math.round((d.saved / peak) * 100);
            const isToday = d.date === todayDate;
            return (
              <div key={d.date} className={styles.chartCol}>
                <div className={styles.chartBarTrack}>
                  <span
                    className={isToday ? styles.chartBarToday : styles.chartBar}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className={styles.chartLabel}>{d.label}</span>
              </div>
            );
          })}
        </div>
        <p className={styles.weekSummary}>
          <span className={styles.weekStat}>{week.saved} saved</span>
          <span aria-hidden>·</span>
          <span className={styles.weekStat}>{week.read} read</span>
          <span aria-hidden>·</span>
          <span className={styles.weekStat}>
            {formatRemaining(week.remainingMinutes)} to go
          </span>
        </p>
      </section>
    </aside>
  );
}
