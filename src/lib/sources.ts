import { createHash } from "node:crypto";
import { z } from "zod";
import type { Volume } from "folio-db-next";
import type { AuthedUserId } from "./auth-types";
import { getFolio, volumeNameForUser } from "./folio";
import { canonicalizeUrl } from "./articles";
import {
  discoverFeed,
  fetchFeed,
  type FeedItem,
  type ParsedFeed,
} from "./feeds";
import { IngestError } from "./ingest";

export type SourceFrontmatter = {
  feedUrl: string;
  siteUrl: string | null;
  title: string;
  addedAt: string;
  lastFetchedAt: string | null;
  lastError: string | null;
  [key: string]: unknown;
};

export const sourceFrontmatterSchema: z.ZodType<SourceFrontmatter> = z.object({
  feedUrl: z.string().url(),
  siteUrl: z.string().url().nullable(),
  title: z.string(),
  addedAt: z.string(),
  lastFetchedAt: z.string().nullable(),
  lastError: z.string().nullable(),
}) as unknown as z.ZodType<SourceFrontmatter>;

export interface Source extends SourceFrontmatter {
  id: string;
}

export function sourceIdForFeedUrl(feedUrl: string): string {
  // Feed URLs often include query strings that matter (`?format=atom`), so we
  // keep them verbatim after normalising the host and dropping tracking noise.
  const canonical = canonicalizeUrl(feedUrl);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function userVolume(userId: AuthedUserId): Volume<SourceFrontmatter> {
  return getFolio().volume<SourceFrontmatter>(
    volumeNameForUser(userId, "sources"),
    { schema: sourceFrontmatterSchema },
  );
}

export async function listSources(userId: AuthedUserId): Promise<Source[]> {
  const pages = await userVolume(userId).list();
  return pages
    .map((p) => ({ id: p.slug, ...p.frontmatter }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getSource(
  userId: AuthedUserId,
  id: string,
): Promise<Source | null> {
  const page = await userVolume(userId).get(id);
  if (!page) return null;
  return { id: page.slug, ...page.frontmatter };
}

export interface AddSourceResult {
  source: Source;
  alreadyExisted: boolean;
}

/**
 * Adds a new source. The input URL can be a feed URL, a site homepage, or any
 * page on a site that exposes a feed. Runs discovery and stores a subscription
 * keyed on the canonical feed URL.
 */
export async function addSource(
  userId: AuthedUserId,
  inputUrl: string,
): Promise<AddSourceResult> {
  const discovered = await discoverFeed(inputUrl);
  const canonicalFeedUrl = canonicalizeUrl(discovered.feedUrl);
  const id = sourceIdForFeedUrl(canonicalFeedUrl);
  const volume = userVolume(userId);
  const existing = await volume.get(id);
  if (existing) {
    return {
      source: { id, ...existing.frontmatter },
      alreadyExisted: true,
    };
  }

  const now = new Date().toISOString();
  const title =
    (discovered.feed.title && discovered.feed.title.trim()) ||
    (discovered.feed.siteUrl &&
      new URL(discovered.feed.siteUrl).hostname.replace(/^www\./, "")) ||
    new URL(canonicalFeedUrl).hostname.replace(/^www\./, "");

  const frontmatter: SourceFrontmatter = {
    feedUrl: canonicalFeedUrl,
    siteUrl: discovered.feed.siteUrl,
    title,
    addedAt: now,
    lastFetchedAt: now,
    lastError: null,
  };
  await volume.set(id, { frontmatter, body: "" });
  return { source: { id, ...frontmatter }, alreadyExisted: false };
}

export async function removeSource(
  userId: AuthedUserId,
  id: string,
): Promise<boolean> {
  const volume = userVolume(userId);
  const existing = await volume.get(id);
  if (!existing) return false;
  await volume.delete(id);
  // Drop the in-process feed cache entry so its items/feed payload is not
  // retained for the lifetime of the serverless instance after the source
  // has been deleted.
  feedCache.delete(cacheKey(userId, id));
  return true;
}

/**
 * In-process TTL cache for parsed feed items. Keyed on (userId, sourceId) so
 * users can't poison each other's caches. The cache lives only as long as the
 * serverless instance — good enough for "don't hammer upstream on every page
 * load" without introducing a new dependency.
 */
const FEED_CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  items: FeedItem[];
  feed: ParsedFeed;
  error: string | null;
}

const feedCache = new Map<string, CacheEntry>();

function cacheKey(userId: AuthedUserId, sourceId: string): string {
  return `${userId}:${sourceId}`;
}

export function clearFeedCache(): void {
  feedCache.clear();
}

export interface FetchedFeedItems {
  feed: ParsedFeed;
  items: FeedItem[];
  fetchedAt: string;
  fromCache: boolean;
  error: string | null;
}

export async function fetchSourceItems(
  userId: AuthedUserId,
  source: Source,
  opts: { force?: boolean } = {},
): Promise<FetchedFeedItems> {
  const key = cacheKey(userId, source.id);
  const cached = feedCache.get(key);
  const now = Date.now();
  if (!opts.force && cached && now - cached.fetchedAt < FEED_CACHE_TTL_MS) {
    return {
      feed: cached.feed,
      items: cached.items,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      fromCache: true,
      error: cached.error,
    };
  }

  try {
    const { feed } = await fetchFeed(source.feedUrl);
    const sorted = [...feed.items].sort((a, b) => {
      const ad = a.publishedAt ?? "";
      const bd = b.publishedAt ?? "";
      return bd.localeCompare(ad);
    });
    feedCache.set(key, {
      fetchedAt: now,
      items: sorted,
      feed,
      error: null,
    });
    await userVolume(userId).patch(source.id, {
      frontmatter: {
        lastFetchedAt: new Date(now).toISOString(),
        lastError: null,
      },
    });
    return {
      feed,
      items: sorted,
      fetchedAt: new Date(now).toISOString(),
      fromCache: false,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof IngestError
        ? err.publicMessage
        : "Could not fetch this feed";
    // If we have a stale cache entry, serve it rather than showing nothing.
    if (cached) {
      feedCache.set(key, { ...cached, error: message });
      return {
        feed: cached.feed,
        items: cached.items,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        fromCache: true,
        error: message,
      };
    }
    await userVolume(userId)
      .patch(source.id, { frontmatter: { lastError: message } })
      .catch(() => {});
    return {
      feed: { title: source.title, siteUrl: source.siteUrl, items: [] },
      items: [],
      fetchedAt: new Date(now).toISOString(),
      fromCache: false,
      error: message,
    };
  }
}

export interface UnifiedFeedItem extends FeedItem {
  sourceId: string;
  sourceTitle: string;
}

export interface UnifiedFeedResult {
  items: UnifiedFeedItem[];
  errors: { sourceId: string; sourceTitle: string; error: string }[];
}

/**
 * Fetches every source for a user in parallel and returns a chronological
 * interleaved list of items. Per-source errors are collected, not thrown.
 */
export async function fetchUnifiedFeed(
  userId: AuthedUserId,
  limit = 60,
): Promise<UnifiedFeedResult> {
  const sources = await listSources(userId);
  if (sources.length === 0) return { items: [], errors: [] };

  const results = await Promise.all(
    sources.map(async (source) => ({
      source,
      fetched: await fetchSourceItems(userId, source),
    })),
  );

  const items: UnifiedFeedItem[] = [];
  const errors: UnifiedFeedResult["errors"] = [];
  for (const { source, fetched } of results) {
    if (fetched.error && fetched.items.length === 0) {
      errors.push({
        sourceId: source.id,
        sourceTitle: source.title,
        error: fetched.error,
      });
      continue;
    }
    for (const item of fetched.items) {
      items.push({
        ...item,
        sourceId: source.id,
        sourceTitle: source.title,
      });
    }
  }

  items.sort((a, b) => {
    const ad = a.publishedAt ?? "";
    const bd = b.publishedAt ?? "";
    return bd.localeCompare(ad);
  });

  return { items: items.slice(0, limit), errors };
}
