import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { addSource, listSources } from "@/lib/sources";
import { IngestError } from "@/lib/ingest";
import { checkOrigin } from "@/lib/csrf";
import { sourceAddLimiter } from "@/lib/rate-limit";

const addSchema = z.object({
  url: z.string().url(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sources = await listSources(userId);
  return Response.json(
    { sources },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const limit = sourceAddLimiter.consume(userId);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 1000) / 1000)),
        },
      },
    );
  }

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
