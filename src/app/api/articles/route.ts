import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  fetchAndParse,
  IngestError,
  MAX_BODY_BYTES,
  parseArticleFromHtml,
} from "@/lib/ingest";
import { listArticles, saveArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { checkOrigin } from "@/lib/csrf";
import { articleIngestLimiter } from "@/lib/rate-limit";

const saveSchema = z.object({
  url: z.string().url(),
  html: z.string().min(1).max(MAX_BODY_BYTES).optional(),
});

export async function GET(req: Request) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const tag = url.searchParams.get("tag") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : undefined;

  const articles = await listArticles(userId, {
    view:
      view === "archive" ? "archive" : view === "inbox" ? "inbox" : undefined,
    state:
      state === "read"
        ? "read"
        : state === "unread"
          ? "unread"
          : state === "all"
            ? "all"
            : undefined,
    tag,
    source,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

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

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { url: string, html?: string }" },
      { status: 400 },
    );
  }

  try {
    const article = parsed.data.html
      ? parseArticleFromHtml(parsed.data.html, parsed.data.url)
      : await fetchAndParse(parsed.data.url);
    const summary = await saveArticle(userId, parsed.data.url, article);
    return Response.json({ article: summary }, { status: 201 });
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
