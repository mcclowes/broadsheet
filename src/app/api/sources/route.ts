import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { addSource, listSources } from "@/lib/sources";
import { IngestError } from "@/lib/ingest";

const addSchema = z.object({
  url: z.string().url(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sources = await listSources(userId);
  return Response.json({ sources });
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

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Expected { url: string }" },
      { status: 400 },
    );
  }

  try {
    const { source, alreadyExisted } = await addSource(userId, parsed.data.url);
    return Response.json(
      { source, alreadyExisted },
      { status: alreadyExisted ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof IngestError) {
      console.error("[api/sources] add failed", {
        url: parsed.data.url,
        message: err.message,
        cause: err.cause,
      });
      return Response.json({ error: err.publicMessage }, { status: 422 });
    }
    console.error("[api/sources] add failed", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
