import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ConflictError, NotFoundError, type Volume } from "folio-db-next";
import type { AuthedUserId } from "./auth-types";
import { getFolio, volumeNameForUser } from "./folio";

// Anchoring note: `start`/`end` are character offsets into the rendered
// article plaintext (i.e. `article.body` as rendered, not the raw markdown).
// This is the simplest workable scheme. It breaks if the article body is
// re-ingested with different content — acceptable for now; robust CFI-style
// anchoring is a separate issue.
export const highlightSchema = z.object({
  id: z.string().min(1).max(64),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1).max(2000),
  note: z.string().max(4000).nullable().default(null),
  color: z.enum(["yellow", "green", "blue", "pink"]).default("yellow"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Highlight = z.infer<typeof highlightSchema>;

export const unanchoredHighlightSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
  note: z.string().max(4000).nullable().default(null),
  createdAt: z.string(),
  source: z.enum(["pocket"]).optional(),
});

export type UnanchoredHighlight = z.infer<typeof unanchoredHighlightSchema>;

// Caps bound the per-article annotation document. Each anchored highlight is
// ≤ ~6 KB on disk; 500 gives a comfortable working set without allowing a
// single article's frontmatter to balloon past a megabyte. Unanchored
// highlights (Pocket imports) are capped separately because a single Pocket
// article can legitimately carry many more.
export const MAX_HIGHLIGHTS_PER_ARTICLE = 500;
export const MAX_UNANCHORED_HIGHLIGHTS_PER_ARTICLE = 1000;

export const annotationsFrontmatterSchema = z.object({
  updatedAt: z.string(),
  highlights: z
    .array(highlightSchema)
    .max(MAX_HIGHLIGHTS_PER_ARTICLE)
    .default([]),
  unanchoredHighlights: z
    .array(unanchoredHighlightSchema)
    .max(MAX_UNANCHORED_HIGHLIGHTS_PER_ARTICLE)
    .optional()
    .default([]),
});

export type AnnotationsFrontmatter = z.infer<
  typeof annotationsFrontmatterSchema
> & { [key: string]: unknown };

function userVolume(userId: AuthedUserId): Volume<AnnotationsFrontmatter> {
  return getFolio().volume<AnnotationsFrontmatter>(
    volumeNameForUser(userId, "annotations"),
    {
      schema:
        annotationsFrontmatterSchema as unknown as z.ZodType<AnnotationsFrontmatter>,
    },
  );
}

export async function listHighlights(
  userId: AuthedUserId,
  articleId: string,
): Promise<Highlight[]> {
  const page = await userVolume(userId).get(articleId);
  if (!page) return [];
  return sortHighlights(page.frontmatter.highlights);
}

export interface ArticleAnnotations {
  articleId: string;
  updatedAt: string;
  highlights: Highlight[];
  unanchoredHighlights: UnanchoredHighlight[];
}

// Aggregates highlights across every article for a user. One frontmatter
// read per annotated article — fine at hundreds, will want projection
// (see FOLIO-TRACKER.md) at thousands. Skips pages with no entries at all.
export async function listAllAnnotations(
  userId: AuthedUserId,
): Promise<ArticleAnnotations[]> {
  const entries = await userVolume(userId).list({ fields: "frontmatter" });
  const result: ArticleAnnotations[] = [];
  for (const e of entries) {
    const highlights = sortHighlights(e.frontmatter.highlights ?? []);
    const unanchoredHighlights = e.frontmatter.unanchoredHighlights ?? [];
    if (highlights.length === 0 && unanchoredHighlights.length === 0) continue;
    result.push({
      articleId: e.slug,
      updatedAt: e.frontmatter.updatedAt,
      highlights,
      unanchoredHighlights,
    });
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Total highlights (anchored + unanchored) per article. One frontmatter scan
 * across the user's annotations volume; cheap at hundreds of articles. The
 * library page already pays a similar full-list cost for `listArticles`, so
 * adding this is a constant-factor extra round trip.
 */
export async function getHighlightCounts(
  userId: AuthedUserId,
): Promise<Map<string, number>> {
  const entries = await userVolume(userId).list({ fields: "frontmatter" });
  const out = new Map<string, number>();
  for (const e of entries) {
    const total =
      (e.frontmatter.highlights?.length ?? 0) +
      (e.frontmatter.unanchoredHighlights?.length ?? 0);
    if (total > 0) out.set(e.slug, total);
  }
  return out;
}

export function sortHighlights(list: Highlight[]): Highlight[] {
  return [...list].sort((a, b) => a.start - b.start || a.end - b.end);
}

export const highlightInputSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  text: z.string().min(1).max(2000),
  note: z.string().max(4000).nullable().optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

export type HighlightInput = z.infer<typeof highlightInputSchema>;

const CONFLICT_RETRY_ATTEMPTS = 3;

async function retryOnConflict<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < CONFLICT_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 10 * 2 ** attempt));
    }
  }
  throw lastErr;
}

async function mutate(
  userId: AuthedUserId,
  articleId: string,
  update: (current: Highlight[]) => Highlight[],
): Promise<Highlight[]> {
  return retryOnConflict(async () => {
    const volume = userVolume(userId);
    const page = await volume.get(articleId);
    const current = page?.frontmatter.highlights ?? [];
    const next = sortHighlights(update(current));
    const frontmatter: AnnotationsFrontmatter = {
      updatedAt: new Date().toISOString(),
      highlights: next,
      unanchoredHighlights: page?.frontmatter.unanchoredHighlights ?? [],
    };
    await volume.set(articleId, { frontmatter, body: "" });
    return next;
  });
}

export async function listUnanchoredHighlights(
  userId: AuthedUserId,
  articleId: string,
): Promise<UnanchoredHighlight[]> {
  const page = await userVolume(userId).get(articleId);
  if (!page) return [];
  return page.frontmatter.unanchoredHighlights ?? [];
}

export interface UnanchoredHighlightInput {
  text: string;
  createdAt: string;
  source?: "pocket";
  note?: string | null;
}

export async function addUnanchoredHighlights(
  userId: AuthedUserId,
  articleId: string,
  inputs: UnanchoredHighlightInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  let added = 0;
  await retryOnConflict(async () => {
    const volume = userVolume(userId);
    const page = await volume.get(articleId);
    const existing = page?.frontmatter.unanchoredHighlights ?? [];
    const seen = new Set(existing.map((h) => `${h.text}\u0000${h.createdAt}`));
    const merged: UnanchoredHighlight[] = [...existing];
    added = 0;
    for (const input of inputs) {
      if (merged.length >= MAX_UNANCHORED_HIGHLIGHTS_PER_ARTICLE) break;
      const text = input.text.trim();
      if (!text) continue;
      const key = `${text}\u0000${input.createdAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Only include `source` when set — folio's YAML dumper rejects
      // `undefined` values, and leaving the key absent is the schema-default
      // shape for non-pocket highlights.
      const entry: UnanchoredHighlight = {
        id: randomUUID(),
        text: text.slice(0, 4000),
        note: input.note ?? null,
        createdAt: input.createdAt,
      };
      if (input.source) entry.source = input.source;
      merged.push(entry);
      added++;
    }
    if (added === 0) return;
    const frontmatter: AnnotationsFrontmatter = {
      updatedAt: new Date().toISOString(),
      highlights: page?.frontmatter.highlights ?? [],
      unanchoredHighlights: merged,
    };
    await volume.set(articleId, { frontmatter, body: "" });
  });
  return added;
}

export class HighlightLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Highlight limit reached (${limit} per article)`);
    this.name = "HighlightLimitError";
  }
}

export async function addHighlight(
  userId: AuthedUserId,
  articleId: string,
  input: HighlightInput,
): Promise<Highlight> {
  if (input.end <= input.start) {
    throw new Error("Highlight end must be greater than start");
  }
  const now = new Date().toISOString();
  const highlight: Highlight = {
    id: randomUUID(),
    start: input.start,
    end: input.end,
    text: input.text,
    note: input.note ?? null,
    color: input.color ?? "yellow",
    createdAt: now,
    updatedAt: now,
  };
  await mutate(userId, articleId, (list) => {
    if (list.length >= MAX_HIGHLIGHTS_PER_ARTICLE) {
      throw new HighlightLimitError(MAX_HIGHLIGHTS_PER_ARTICLE);
    }
    return [...list, highlight];
  });
  return highlight;
}

export const highlightPatchSchema = z.object({
  note: z.string().max(4000).nullable().optional(),
  color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
});

export type HighlightPatch = z.infer<typeof highlightPatchSchema>;

export async function updateHighlight(
  userId: AuthedUserId,
  articleId: string,
  highlightId: string,
  patch: HighlightPatch,
): Promise<Highlight | null> {
  let updated: Highlight | null = null;
  await mutate(userId, articleId, (list) => {
    return list.map((h) => {
      if (h.id !== highlightId) return h;
      const next: Highlight = {
        ...h,
        note: patch.note !== undefined ? patch.note : h.note,
        color: patch.color ?? h.color,
        updatedAt: new Date().toISOString(),
      };
      updated = next;
      return next;
    });
  });
  return updated;
}

export async function deleteHighlight(
  userId: AuthedUserId,
  articleId: string,
  highlightId: string,
): Promise<boolean> {
  let removed = false;
  try {
    await mutate(userId, articleId, (list) => {
      const next = list.filter((h) => h.id !== highlightId);
      removed = next.length !== list.length;
      return next;
    });
  } catch (err) {
    if (err instanceof NotFoundError) return false;
    throw err;
  }
  return removed;
}
