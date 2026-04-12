import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import {
  updateAnnotation,
  updateAnnotationSchema,
  removeAnnotation,
} from "@/lib/annotations";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; annotationId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, annotationId } = await params;
  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateAnnotationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const annotation = await updateAnnotation(
      userId,
      id,
      annotationId,
      parsed.data,
    );
    return Response.json({ annotation });
  } catch (err) {
    if (err instanceof Error && err.message === "Annotation not found") {
      return Response.json({ error: "Annotation not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; annotationId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, annotationId } = await params;
  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  await removeAnnotation(userId, id, annotationId);
  return Response.json({ ok: true });
}
