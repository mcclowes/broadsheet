import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./primary-tabs.module.scss";

type Section = "library" | "sources" | "settings";

const SECTIONS: ReadonlyArray<{ key: Section; href: string; label: string }> = [
  { key: "library", href: "/library", label: "Library" },
  { key: "sources", href: "/sources", label: "Sources" },
  { key: "settings", href: "/settings", label: "Settings" },
];

export function PrimaryTabs({
  active,
  right,
}: {
  active: Section;
  right?: ReactNode;
}) {
  return (
    <nav className={styles.tabs} aria-label="Primary">
      <div className={styles.tabsLeft}>
        {SECTIONS.map((s) => {
          const isActive = s.key === active;
          return (
            <Link
              key={s.key}
              href={s.href}
              className={isActive ? styles.tabActive : styles.tab}
              {...(isActive && { "aria-current": "page" as const })}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
      {right}
    </nav>
  );
}
