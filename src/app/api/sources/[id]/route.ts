import { auth } from "@clerk/nextjs/server";
import { ARTICLE_ID_RE } from "@/lib/articles";
import { removeSource } from "@/lib/sources";
import { authedUserId } from "@/lib/auth-types";
import { checkOrigin } from "@/lib/csrf";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  if (!ARTICLE_ID_RE.test(id)) {
    return Response.json({ error: "Invalid source id" }, { status: 400 });
  }

  const removed = await removeSource(userId, id);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
