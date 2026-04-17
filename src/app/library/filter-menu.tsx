import Link from "next/link";
import styles from "./library.module.scss";

export interface FilterMenuOption {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export function FilterMenu({
  label,
  summary,
  options,
}: {
  label: string;
  summary: string;
  options: ReadonlyArray<FilterMenuOption>;
}) {
  return (
    <details className={styles.filterMenu}>
      <summary className={styles.filterMenuSummary} aria-label={label}>
        <span>{summary}</span>
        <svg
          className={styles.filterMenuChevron}
          viewBox="0 0 24 24"
          fill="none"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className={styles.filterMenuPanel} role="menu">
        {options.map((o) => (
          <Link
            key={o.key}
            href={o.href}
            className={
              o.active ? styles.filterMenuItemActive : styles.filterMenuItem
            }
            role="menuitemradio"
            aria-checked={o.active}
          >
            <span>{o.label}</span>
            {o.active ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width="13"
                height="13"
                aria-hidden="true"
              >
                <path
                  d="m5 12 5 5L20 7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </Link>
        ))}
      </div>
    </details>
  );
}
