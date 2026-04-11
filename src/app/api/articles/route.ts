import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { fetchAndParse, IngestError } from "@/lib/ingest";
import { listArticles, saveArticle } from "@/lib/articles";

const saveSchema = z.object({ url: z.string().url() });

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const articles = await listArticles(userId);
  return Response.json({ articles });
}

export async function POST(req: Request) {
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
      { error: "Expected { url: string }" },
      { status: 400 },
    );
  }

  try {
    const article = await fetchAndParse(parsed.data.url);
    const summary = await saveArticle(userId, parsed.data.url, article);
    return Response.json({ article: summary }, { status: 201 });
  } catch (err) {
    if (err instanceof IngestError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    console.error("[api/articles] save failed", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
