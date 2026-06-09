import type { Metadata } from "next";

/**
 * Metadata for auth-gated app pages. The title flows through the root layout's
 * `%s · Broadsheet` template, and `robots` keeps private library/article URLs
 * out of search indexes even if a logged-in session or a leaked URL is crawled.
 */
export function privatePage(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false },
  };
}
