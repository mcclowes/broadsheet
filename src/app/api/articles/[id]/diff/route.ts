import { auth } from "@clerk/nextjs/server";
import { diffLines } from "diff";
import { getArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { fetchAndParse, IngestError } from "@/lib/ingest";
import { diffLimiter } from "@/lib/rate-limit";

export interface DiffChange {
  added: boolean;
  removed: boolean;
  value: string;
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
  try {
    const { parsed } = await fetchAndParse(article.url);
    currentMarkdown = parsed.markdown;
  } catch (err) {
    const message =
      err instanceof IngestError
        ? err.publicMessage
        : "Could not re-fetch article";
    return Response.json({ error: message }, { status: 502 });
  }

  const changes: DiffChange[] = diffLines(
    article.markdown,
    currentMarkdown,
  ).map((c) => ({
    added: !!c.added,
    removed: !!c.removed,
    value: c.value,
  }));

  const hasChanges = changes.some((c) => c.added || c.removed);

  return Response.json({
    title: article.title,
    savedAt: article.savedAt,
    fetchedAt: new Date().toISOString(),
    hasChanges,
    changes,
  });
}
