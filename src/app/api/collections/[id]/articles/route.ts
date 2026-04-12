import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import {
  addArticleToCollection,
  removeArticleFromCollection,
} from "@/lib/collections";

const addArticleSchema = z.object({
  articleId: z.string().min(1),
});

export async function POST(
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

  const parsed = addArticleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { articleId: string }" },
      { status: 400 },
    );
  }

  try {
    const collection = await addArticleToCollection(
      userId,
      id,
      parsed.data.articleId,
    );
    return Response.json({ collection });
  } catch (err) {
    if (err instanceof Error && err.message === "Collection not found") {
      return Response.json({ error: "Collection not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
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

  const parsed = addArticleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { articleId: string }" },
      { status: 400 },
    );
  }

  try {
    const collection = await removeArticleFromCollection(
      userId,
      id,
      parsed.data.articleId,
    );
    return Response.json({ collection });
  } catch (err) {
    if (err instanceof Error && err.message === "Collection not found") {
      return Response.json({ error: "Collection not found" }, { status: 404 });
    }
    throw err;
  }
}
