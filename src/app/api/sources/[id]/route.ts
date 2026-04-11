import { auth } from "@clerk/nextjs/server";
import { removeSource } from "@/lib/sources";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return Response.json({ error: "Invalid source id" }, { status: 400 });
  }

  const removed = await removeSource(userId, id);
  if (!removed) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
