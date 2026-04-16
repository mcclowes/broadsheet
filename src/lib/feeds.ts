import { JSDOM } from "jsdom";
import {
  DISCOVERY_TIMEOUT_MS,
  fetchPublicResource,
  IngestError,
  isHtmlContentType,
} from "./ingest";

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string | null;
}

export interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  items: FeedItem[];
}

export interface DiscoveredFeed {
  feedUrl: string;
  feed: ParsedFeed;
}

const FEED_CONTENT_TYPE =
  /^(?:application\/(?:rss|atom|rdf)\+xml|application\/xml|text\/xml|application\/feed\+json|application\/json)\b/i;

export function isFeedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return FEED_CONTENT_TYPE.test(contentType);
}

const FEED_ACCEPT =
  "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.9, application/feed+json;q=0.8";

const DISCOVERY_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feeds/posts/default",
];

// Upper bound on <link rel="alternate"> candidates we'll probe during
// discovery. Sites with dozens of per-tag/per-author feeds can otherwise
// cascade into many failed fetches.
const MAX_DISCOVERY_CANDIDATES = 5;

function textContentOf(el: Element | null): string {
  return (el?.textContent ?? "").trim();
}

function firstByTag(parent: Element | Document, tag: string): Element | null {
  const matches = parent.getElementsByTagNameNS("*", tag);
  return matches.length > 0 ? matches[0] : null;
}

function allByTag(parent: Element | Document, tag: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", tag));
}

function normaliseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(html: string): string {
  return collapseWhitespace(html.replace(/<[^>]+>/g, " "));
}

function truncate(text: string, max = 280): string | null {
  const clean = stripHtml(text);
  if (!clean) return null;
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

function resolveUrl(href: string | null, base: string | null): string | null {
  if (!href) return null;
  try {
    return new URL(href, base ?? undefined).toString();
  } catch {
    return null;
  }
}

function parseRss(doc: Document, baseUrl: string): ParsedFeed {
  const channel = firstByTag(doc, "channel");
  const root = channel ?? doc.documentElement;
  const title = textContentOf(firstByTag(root, "title")) || null;
  const linkEl = firstByTag(root, "link");
  const siteUrl = resolveUrl(textContentOf(linkEl) || null, baseUrl);

  const items: FeedItem[] = [];
  for (const item of allByTag(root, "item")) {
    const itemTitle = textContentOf(firstByTag(item, "title")) || "Untitled";
    const itemLinkEl = firstByTag(item, "link");
    const itemUrl = resolveUrl(textContentOf(itemLinkEl) || null, baseUrl);
    if (!itemUrl) continue;
    const published =
      normaliseDate(textContentOf(firstByTag(item, "pubDate"))) ??
      normaliseDate(textContentOf(firstByTag(item, "date"))) ??
      normaliseDate(textContentOf(firstByTag(item, "published")));
    const description =
      textContentOf(firstByTag(item, "description")) ||
      textContentOf(firstByTag(item, "encoded")) ||
      textContentOf(firstByTag(item, "summary"));
    items.push({
      title: collapseWhitespace(itemTitle),
      url: itemUrl,
      publishedAt: published,
      excerpt: description ? truncate(description) : null,
    });
  }

  return { title, siteUrl, items };
}

function parseAtom(doc: Document, baseUrl: string): ParsedFeed {
  const root = doc.documentElement;
  const title = textContentOf(firstByTag(root, "title")) || null;
  let siteUrl: string | null = null;
  for (const link of allByTag(root, "link")) {
    if (link.parentElement !== root) continue;
    const rel = link.getAttribute("rel") ?? "alternate";
    if (rel !== "alternate") continue;
    const href = link.getAttribute("href");
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) {
      siteUrl = resolved;
      break;
    }
  }

  const items: FeedItem[] = [];
  for (const entry of allByTag(root, "entry")) {
    const entryTitle = textContentOf(firstByTag(entry, "title")) || "Untitled";
    let entryUrl: string | null = null;
    for (const link of allByTag(entry, "link")) {
      const rel = link.getAttribute("rel") ?? "alternate";
      if (rel !== "alternate") continue;
      const resolved = resolveUrl(link.getAttribute("href"), baseUrl);
      if (resolved) {
        entryUrl = resolved;
        break;
      }
    }
    if (!entryUrl) continue;
    const published =
      normaliseDate(textContentOf(firstByTag(entry, "published"))) ??
      normaliseDate(textContentOf(firstByTag(entry, "updated")));
    const summary =
      textContentOf(firstByTag(entry, "summary")) ||
      textContentOf(firstByTag(entry, "content"));
    items.push({
      title: collapseWhitespace(entryTitle),
      url: entryUrl,
      publishedAt: published,
      excerpt: summary ? truncate(summary) : null,
    });
  }

  return { title, siteUrl, items };
}

export function parseFeedXml(xml: string, baseUrl: string): ParsedFeed {
  const trimmed = xml.trim();
  if (!trimmed) {
    throw new IngestError("Empty feed body", undefined, "Feed was empty");
  }
  let doc: Document;
  try {
    const dom = new JSDOM(trimmed, { contentType: "text/xml" });
    doc = dom.window.document;
  } catch (err) {
    throw new IngestError(
      `Could not parse feed XML: ${(err as Error).message}`,
      err,
      "Could not parse feed XML",
    );
  }

  const rootName = doc.documentElement.localName.toLowerCase();
  let feed: ParsedFeed;
  if (rootName === "rss" || rootName === "rdf") {
    feed = parseRss(doc, baseUrl);
  } else if (rootName === "feed") {
    feed = parseAtom(doc, baseUrl);
  } else {
    throw new IngestError(
      `Unknown feed root element <${rootName}>`,
      undefined,
      "This does not look like an RSS or Atom feed",
    );
  }

  if (feed.items.length === 0) {
    // An empty but well-formed feed isn't an error by itself, but we want
    // add-time validation to reject garbage XML. Only throw if the root was
    // not one of the recognised feed types — that's already handled above.
  }

  return feed;
}

export async function fetchFeed(
  feedUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<{
  feed: ParsedFeed;
  finalUrl: string;
}> {
  const { body, finalUrl } = await fetchPublicResource(feedUrl, {
    accept: FEED_ACCEPT,
    // Many feeds are served as text/html or application/octet-stream in the
    // wild. We accept any content type here and rely on XML parsing to
    // distinguish feeds from HTML at the parse step below.
    validateContentType: () => true,
    contentTypeError: "Upstream did not return a feed",
    timeoutMs: opts.timeoutMs,
  });
  const feed = parseFeedXml(body, finalUrl);
  return { feed, finalUrl };
}

interface HtmlFeedLink {
  href: string;
  type: string | null;
}

export function extractFeedLinksFromHtml(
  html: string,
  baseUrl: string,
): string[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const links: HtmlFeedLink[] = [];
  for (const link of Array.from(
    doc.querySelectorAll("link[rel~='alternate']"),
  )) {
    const type = link.getAttribute("type");
    if (!type) continue;
    if (!/rss|atom|xml|feed\+json/i.test(type)) continue;
    const href = link.getAttribute("href");
    if (!href) continue;
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) links.push({ href: resolved, type });
  }
  // Prefer Atom, then RSS, then anything else.
  links.sort((a, b) => {
    const score = (t: string | null): number => {
      if (!t) return 3;
      if (/atom/i.test(t)) return 0;
      if (/rss/i.test(t)) return 1;
      return 2;
    };
    return score(a.type) - score(b.type);
  });
  return links.map((l) => l.href);
}

/**
 * Given any URL the user pastes (site homepage, feed URL, or article URL),
 * try to discover and fetch a feed. Returns the canonical feed URL and the
 * parsed feed body.
 */
export async function discoverFeed(inputUrl: string): Promise<DiscoveredFeed> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new IngestError("Invalid URL", undefined, "Invalid URL");
  }

  // Speculative probes (initial as-a-feed attempt, HTML <link> candidates,
  // well-known paths) use a shorter timeout than a normal fetch so a cascade
  // of misses can't wall-clock a serverless invocation.
  const probe = { timeoutMs: DISCOVERY_TIMEOUT_MS };

  // Attempt 1: treat the URL as a feed directly.
  try {
    const { feed, finalUrl } = await fetchFeed(parsed.toString(), probe);
    return { feedUrl: finalUrl, feed };
  } catch (err) {
    if (!(err instanceof IngestError)) throw err;
    // Fall through to HTML discovery.
  }

  // Attempt 2: fetch as HTML and scan for <link rel="alternate"> feeds.
  let html: string | null = null;
  try {
    const fetched = await fetchPublicResource(parsed.toString(), {
      accept: "text/html,application/xhtml+xml",
      validateContentType: isHtmlContentType,
      contentTypeError: "Upstream did not return HTML",
      timeoutMs: DISCOVERY_TIMEOUT_MS,
    });
    html = fetched.body;
    const candidates = extractFeedLinksFromHtml(html, fetched.finalUrl).slice(
      0,
      MAX_DISCOVERY_CANDIDATES,
    );
    for (const candidate of candidates) {
      try {
        const { feed, finalUrl } = await fetchFeed(candidate, probe);
        return { feedUrl: finalUrl, feed };
      } catch {
        // try the next candidate
      }
    }
  } catch {
    // ignore — we'll try the well-known paths next
  }

  // Attempt 3: try well-known feed paths on the origin.
  for (const path of DISCOVERY_PATHS) {
    const candidate = new URL(path, `${parsed.protocol}//${parsed.host}`);
    try {
      const { feed, finalUrl } = await fetchFeed(candidate.toString(), probe);
      return { feedUrl: finalUrl, feed };
    } catch {
      // try the next path
    }
  }

  throw new IngestError(
    `No feed discovered for ${parsed.toString()}`,
    undefined,
    "Could not find an RSS or Atom feed at that URL",
  );
}
