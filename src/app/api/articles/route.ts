import { auth } from "@clerk/nextjs/server";
import { fetchAndParse, IngestError, parseArticleFromHtml } from "@/lib/ingest";
import {
  listArticles,
  listArticlesPage,
  parseListFilters,
  saveArticleWithOutcome,
  saveArticleRequestSchema,
} from "@/lib/articles";
import {
  addHighlight,
  addUnanchoredHighlights,
  HighlightLimitError,
} from "@/lib/annotations";
import { articlePlaintext } from "@/lib/markdown";
import { authedUserId } from "@/lib/auth-types";
import type { AuthedUserId } from "@/lib/auth-types";
import { articleIngestLimiter } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const url = new URL(req.url);
  const filters = parseListFilters(url.searchParams);
  // Cursor pagination is opt-in: callers that explicitly pass `cursor` or
  // `limit` get bounded pages; everyone else keeps the historical
  // "give me everything matching these filters" contract. `nextCursor` is
  // always present in the response so clients don't need to branch.
  const paginated =
    url.searchParams.has("cursor") || url.searchParams.has("limit");
  const { articles, nextCursor } = paginated
    ? await listArticlesPage(userId, filters)
    : {
        articles: await listArticles(userId, filters),
        nextCursor: null as string | null,
      };

  return Response.json(
    { articles, nextCursor },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  // Origin check + auth are enforced by `src/proxy.ts`. Handler still
  // re-reads `auth()` because we need `userId` as a value, not just
  // "is there one".
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const limit = articleIngestLimiter.consume(userId);
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = saveArticleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { url: string, html?: string }" },
      { status: 400 },
    );
  }

  try {
    let article;
    let saveUrl = parsed.data.url;
    if (parsed.data.html) {
      article = parseArticleFromHtml(parsed.data.html, parsed.data.url);
    } else {
      const result = await fetchAndParse(parsed.data.url);
      article = result.parsed;
      saveUrl = result.finalUrl;
    }
    const { article: summary, created } = await saveArticleWithOutcome(
      userId,
      saveUrl,
      article,
    );

    if (parsed.data.selection) {
      await attachSelectionHighlight(
        userId,
        summary.id,
        article.markdown,
        parsed.data.selection.text,
      );
    }

    return Response.json(
      { article: summary, created },
      { status: created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof IngestError) {
      console.error("[api/articles] ingest failed", {
        url: parsed.data.url,
        message: err.message,
        cause: err.cause,
      });
      return Response.json({ error: err.publicMessage }, { status: 422 });
    }
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    console.error("[api/articles] save failed", {
      url: parsed.data.url,
      errorName: err instanceof Error ? err.constructor.name : typeof err,
      code: e?.code,
      name: e?.name,
      message: e?.message,
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// Best-effort attach: anchor the selection in the rendered plaintext if we
// can find a single occurrence, otherwise keep it as an unanchored highlight.
// Failures here never fail the save — the article is already persisted and
// a missing highlight is recoverable, a 500 on save is not.
async function attachSelectionHighlight(
  userId: AuthedUserId,
  articleId: string,
  markdown: string,
  rawText: string,
): Promise<void> {
  const text = rawText.trim();
  if (!text) return;

  try {
    const plaintext = articlePlaintext(markdown);
    const first = plaintext.indexOf(text);
    const unique = first !== -1 && plaintext.indexOf(text, first + 1) === -1;
    if (unique) {
      await addHighlight(userId, articleId, {
        start: first,
        end: first + text.length,
        text,
      });
      return;
    }
    await addUnanchoredHighlights(userId, articleId, [
      { text, createdAt: new Date().toISOString() },
    ]);
  } catch (err) {
    if (err instanceof HighlightLimitError) {
      // Per-article cap reached — skip silently; article save still wins.
      return;
    }
    console.warn("[api/articles] attach selection failed", {
      articleId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
