import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import { removeHighlight } from "@/lib/highlights";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; highlightId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, highlightId } = await params;
  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  await removeHighlight(userId, id, highlightId);
  return Response.json({ ok: true });
}
