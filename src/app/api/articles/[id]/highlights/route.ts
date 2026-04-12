import { auth } from "@clerk/nextjs/server";
import { getArticle } from "@/lib/articles";
import {
  addHighlight,
  addHighlightSchema,
  listHighlights,
} from "@/lib/highlights";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  const highlights = await listHighlights(userId, id);
  return Response.json({ highlights });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const article = await getArticle(userId, id);
  if (!article) return Response.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = addHighlightSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const highlight = await addHighlight(userId, id, parsed.data);
  return Response.json({ highlight }, { status: 201 });
}
