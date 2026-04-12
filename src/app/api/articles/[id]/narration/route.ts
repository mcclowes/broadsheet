import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import { NarrationError, prepareText, synthesizeSpeech } from "@/lib/narration";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const article = await getArticle(userId, id);
  if (!article) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { text, truncated } = prepareText(article.body);

  let result;
  try {
    result = await synthesizeSpeech(text);
  } catch (err) {
    if (err instanceof NarrationError) {
      console.error("[narration]", err.message);
      return Response.json({ error: err.publicMessage }, { status: 502 });
    }
    throw err;
  }

  return new Response(result.audio, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.audio.byteLength),
      "Cache-Control": "private, max-age=3600",
      ...(truncated ? { "X-Narration-Truncated": "true" } : {}),
    },
  });
}
