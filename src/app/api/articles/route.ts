import { auth } from "@clerk/nextjs/server";
import { fetchAndParse, IngestError, parseArticleFromHtml } from "@/lib/ingest";
import {
  listArticles,
  parseListFilters,
  saveArticleWithOutcome,
  saveArticleRequestSchema,
} from "@/lib/articles";
import { addUnanchoredHighlights } from "@/lib/annotations";
import { authedUserId } from "@/lib/auth-types";
import { checkOrigin } from "@/lib/csrf";
import { articleIngestLimiter } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const url = new URL(req.url);
  const filters = parseListFilters(url.searchParams);
  const articles = await listArticles(userId, filters);

  return Response.json(
    { articles },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const originError = checkOrigin(req);
  if (originError) return originError;

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
    const selectionText = parsed.data.selection?.text.trim();
    if (selectionText) {
      await addUnanchoredHighlights(userId, summary.id, [
        { text: selectionText, createdAt: new Date().toISOString() },
      ]);
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
    console.error("[api/articles] save failed", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
