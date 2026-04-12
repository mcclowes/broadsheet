import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  fetchAndParse,
  IngestError,
  MAX_BODY_BYTES,
  parseArticleFromHtml,
} from "@/lib/ingest";
import { listArticles, saveArticle } from "@/lib/articles";
import { checkOrigin } from "@/lib/csrf";

const saveSchema = z.object({
  url: z.string().url(),
  html: z.string().min(1).max(MAX_BODY_BYTES).optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const articles = await listArticles(userId);
  return Response.json({ articles });
}

export async function POST(req: Request) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
