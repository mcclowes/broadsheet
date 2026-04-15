import { auth } from "@clerk/nextjs/server";
import { diffLines } from "diff";
import { getArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { fetchAndParse, IngestError } from "@/lib/ingest";
import { diffLimiter } from "@/lib/rate-limit";
import { TtlCache } from "@/lib/ttl-cache";

export interface DiffChange {
  added: boolean;
  removed: boolean;
  value: string;
}

// Short-TTL cache of the *current* fetched markdown, keyed on articleId.
// Article IDs are a hash of the canonicalised URL, so cross-user requests
// for the same page share a single outbound fetch — "check for changes"
// presses from different users or tabs within the minute only hit upstream
// once. The user-specific stored body is still re-read from Folio every
// call, so the diff itself remains per-user.
const DIFF_FETCH_TTL_MS = 60_000;
const DIFF_FETCH_MAX_ENTRIES = 256;
const diffFetchCache = new TtlCache<{ markdown: string; fetchedAt: string }>({
  ttlMs: DIFF_FETCH_TTL_MS,
  maxEntries: DIFF_FETCH_MAX_ENTRIES,
});

/** Visible for tests — drops cached fetches between test cases. */
export function _clearDiffFetchCache(): void {
  diffFetchCache.clear();
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return Response.json({ error: "Invalid article id" }, { status: 400 });
  }

  const limit = diffLimiter.consume(userId);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 1000) / 1000)),
        },
      },
    );
  }

  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  let currentMarkdown: string;
  let fetchedAt: string;
  const cached = diffFetchCache.get(id);
  if (cached) {
    currentMarkdown = cached.markdown;
    fetchedAt = cached.fetchedAt;
  } else {
    try {
      const { parsed } = await fetchAndParse(article.url);
      currentMarkdown = parsed.markdown;
      fetchedAt = new Date().toISOString();
      diffFetchCache.set(id, { markdown: currentMarkdown, fetchedAt });
    } catch (err) {
      const message =
        err instanceof IngestError
          ? err.publicMessage
          : "Could not re-fetch article";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  const changes: DiffChange[] = diffLines(article.body, currentMarkdown).map(
    (c) => ({
      added: !!c.added,
      removed: !!c.removed,
      value: c.value,
    }),
  );

  const hasChanges = changes.some((c) => c.added || c.removed);

  return Response.json({
    title: article.title,
    savedAt: article.savedAt,
    fetchedAt,
    hasChanges,
    changes,
  });
}
