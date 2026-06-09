"use client";

import { useEffect, useState } from "react";
import styles from "./article-toc.module.scss";

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "section";
  let slug = base;
  let n = 1;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

/**
 * Desktop-only table of contents docked to the right of the reading column.
 * Reads h2/h3 from the already-rendered article body, assigns stable anchor
 * ids in the DOM, and tracks the heading nearest the top of the viewport.
 * Hidden below the breakpoint and when there are too few headings to be useful.
 */
export function ArticleToc() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Build the TOC from the rendered article body once it's in the DOM.
  useEffect(() => {
    const body = document.querySelector<HTMLElement>(".reader-body");
    if (!body) return;
    const headings = Array.from(
      body.querySelectorAll<HTMLHeadingElement>("h2, h3"),
    );
    const used = new Set<string>();
    const next = headings.map<TocItem>((h) => {
      if (h.id) used.add(h.id);
      else h.id = slugify(h.textContent ?? "", used);
      // Headroom so the sticky nav doesn't cover the target on jump.
      h.style.scrollMarginTop = "5rem";
      return {
        id: h.id,
        text: (h.textContent ?? "").trim(),
        level: h.tagName === "H3" ? 3 : 2,
      };
    });
    // The headings live in the sibling-rendered ".reader-body" markdown HTML,
    // not in this component's render output, so the list genuinely can't be
    // derived during render — this is a one-time sync from the external DOM on
    // mount, the sanctioned use of an effect. The rule can't tell that apart
    // from setState-driven derived-state cascades, so suppress it here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(next.filter((i) => i.text.length > 0));
  }, []);

  // Scroll-spy: the active heading is the topmost one within the upper band.
  useEffect(() => {
    if (items.length === 0) return;
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      // Activate a heading once it reaches the top ~15% and keep it active
      // until the next one arrives — a narrow band near the top of the page.
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <nav className={styles.toc} aria-label="Table of contents">
      <p className={styles.label}>Contents</p>
      <ul className={styles.list}>
        {items.map((item, i) => (
          <li
            key={item.id}
            className={item.level === 3 ? styles.sub : styles.item}
            style={{ "--i": i } as React.CSSProperties}
          >
            <a
              href={`#${item.id}`}
              className={`${styles.link} ${activeId === item.id ? styles.active : ""}`}
              onClick={(e) => handleClick(e, item.id)}
              aria-current={activeId === item.id ? "location" : undefined}
            >
              <span className={styles.text}>{item.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
