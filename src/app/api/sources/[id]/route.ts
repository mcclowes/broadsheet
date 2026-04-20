import { auth } from "@clerk/nextjs/server";
import { isValidId } from "@/lib/ids";
import { removeSource } from "@/lib/sources";
import { authedUserId } from "@/lib/auth-types";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Origin check + auth are enforced by `src/proxy.ts`.
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  if (!isValidId(id)) {
    return Response.json({ error: "Invalid source id" }, { status: 400 });
  }

  const removed = await removeSource(userId, id);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
