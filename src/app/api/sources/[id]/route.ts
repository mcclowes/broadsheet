import { removeSource } from "@/lib/sources";
import { getRequestUserId } from "@/lib/preview-mode";
import { checkOrigin } from "@/lib/csrf";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const userId = await getRequestUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return Response.json({ error: "Invalid source id" }, { status: 400 });
  }

  const removed = await removeSource(userId, id);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
