import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { NotFoundError } from "folio-db-next";
import { getArticle, markRead, setArchived, setTags } from "@/lib/articles";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const article = await getArticle(userId, id);
    if (!article) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ article });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[api/articles/GET] read failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchSchema = z
  .object({
    read: z.boolean().optional(),
    archived: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (v) =>
      v.read !== undefined || v.archived !== undefined || v.tags !== undefined,
    { message: "No fields to update" },
  );

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  try {
    const existing = await getArticle(userId, id);
    if (!existing)
      return Response.json({ error: "Not found" }, { status: 404 });

    if (updates.read !== undefined) await markRead(userId, id, updates.read);
    if (updates.archived !== undefined)
      await setArchived(userId, id, updates.archived);
    let tags = existing.tags;
    if (updates.tags !== undefined)
      tags = await setTags(userId, id, updates.tags);

    return Response.json({ ok: true, tags });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[api/articles/PATCH] update failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
