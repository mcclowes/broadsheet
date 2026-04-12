import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getArticle, listArticles } from "@/lib/articles";
import { listHighlights } from "@/lib/highlights";
import { listAnnotations } from "@/lib/annotations";
import { getCollection } from "@/lib/collections";
import {
  exportArticles,
  type ArticleExportData,
  type ExportFormat,
} from "@/lib/export";

const querySchema = z.object({
  format: z.enum(["markdown", "json", "text", "bibtex"]),
  articleId: z.string().optional(),
  collectionId: z.string().optional(),
});

const CONTENT_TYPES: Record<ExportFormat, string> = {
  markdown: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  text: "text/plain; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
};

const EXTENSIONS: Record<ExportFormat, string> = {
  markdown: "md",
  json: "json",
  text: "txt",
  bibtex: "bib",
};

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    format: url.searchParams.get("format"),
    articleId: url.searchParams.get("articleId") ?? undefined,
    collectionId: url.searchParams.get("collectionId") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Expected ?format=markdown|json|text|bibtex and optionally articleId or collectionId",
      },
      { status: 400 },
    );
  }

  const { format, articleId, collectionId } = parsed.data;
  const data: ArticleExportData[] = [];

  if (articleId) {
    const article = await getArticle(userId, articleId);
    if (!article)
      return Response.json({ error: "Article not found" }, { status: 404 });

    const highlights = await listHighlights(userId, articleId);
    const annotations = await listAnnotations(userId, articleId);
    data.push({ article, highlights, annotations });
  } else if (collectionId) {
    const collection = await getCollection(userId, collectionId);
    if (!collection)
      return Response.json({ error: "Collection not found" }, { status: 404 });

    for (const aid of collection.articleIds) {
      const article = await getArticle(userId, aid);
      if (!article) continue;
      const highlights = await listHighlights(userId, aid);
      const annotations = await listAnnotations(userId, aid);
      data.push({ article, highlights, annotations });
    }
  } else {
    const articles = await listArticles(userId);
    for (const article of articles) {
      const highlights = await listHighlights(userId, article.id);
      const annotations = await listAnnotations(userId, article.id);
      data.push({ article, highlights, annotations });
    }
  }

  const content = exportArticles(format, data);
  const filename = `broadsheet-export.${EXTENSIONS[format]}`;

  return new Response(content, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
