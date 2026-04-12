import { auth } from "@clerk/nextjs/server";
import {
  createCollection,
  createCollectionSchema,
  listCollections,
} from "@/lib/collections";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const collections = await listCollections(userId);
  return Response.json({ collections });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const collection = await createCollection(userId, parsed.data);
  return Response.json({ collection }, { status: 201 });
}
