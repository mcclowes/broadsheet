import { auth } from "@clerk/nextjs/server";
import { diffLines } from "diff";
import { getArticle } from "@/lib/articles";
import { fetchAndParse, IngestError } from "@/lib/ingest";

export interface DiffChange {
  added: boolean;
  removed: boolean;
  value: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  let currentMarkdown: string;
  try {
    const parsed = await fetchAndParse(article.url);
    currentMarkdown = parsed.markdown;
  } catch (err) {
    const message =
      err instanceof IngestError
        ? err.publicMessage
        : "Could not re-fetch article";
    return Response.json({ error: message }, { status: 502 });
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
    fetchedAt: new Date().toISOString(),
    hasChanges,
    changes,
  });
}
