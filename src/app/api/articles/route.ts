import { auth } from "@clerk/nextjs/server";
import { fetchAndParse, IngestError, parseArticleFromHtml } from "@/lib/ingest";
import {
  getArticle,
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
import { anchorSelection } from "@/lib/anchor";
import { authedUserId } from "@/lib/auth-types";
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

    // If the caller passed a `selection`, try to anchor it against the
    // stored article body and create a highlight. We re-read the stored
    // body so the offset space matches what the reader will render — for
    // an "already saved" article that may differ from the freshly-parsed
    // markdown. Failures here don't fail the save.
    let highlightCreated: "anchored" | "unanchored" | "skipped" = "skipped";
    if (parsed.data.selection) {
      try {
        const stored = await getArticle(userId, summary.id);
        if (stored) {
          const match = anchorSelection(
            stored.body,
            parsed.data.selection.text,
          );
          if (match) {
            await addHighlight(userId, summary.id, {
              start: match.start,
              end: match.end,
              text: parsed.data.selection.text.trim().slice(0, 2000),
            });
            highlightCreated = "anchored";
          } else {
            await addUnanchoredHighlights(userId, summary.id, [
              {
                text: parsed.data.selection.text,
                createdAt: new Date().toISOString(),
              },
            ]);
            highlightCreated = "unanchored";
          }
        }
      } catch (err) {
        if (!(err instanceof HighlightLimitError)) {
          console.error("[api/articles] highlight from selection failed", {
            articleId: summary.id,
            err,
          });
        }
      }
    }

    return Response.json(
      { article: summary, created, highlight: highlightCreated },
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
