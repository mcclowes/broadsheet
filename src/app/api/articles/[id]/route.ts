import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ConflictError, NotFoundError } from "folio-db-next";
import { getArticle, patchArticle } from "@/lib/articles";
import { authedUserId } from "@/lib/auth-types";
import { checkOrigin } from "@/lib/csrf";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return Response.json({ error: "Invalid article id" }, { status: 400 });
  }
  try {
    const article = await getArticle(userId, id);
    if (!article) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(
      { article },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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
  const originError = checkOrigin(req);
  if (originError) return originError;

  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) {
    return Response.json({ error: "Invalid article id" }, { status: 400 });
  }

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

    const result = await patchArticle(userId, id, updates);

    // The library and reader pages are `force-dynamic` so they SSR on every
    // request, but Next.js's client router cache can still serve a stale RSC
    // payload on back navigation from /read/[id] → /library. Marking an
    // article as read there then appears to "not work" — the article still
    // shows as unread until the cache entry expires. Explicitly invalidating
    // both paths forces the client to fetch fresh data on the next visit.
    revalidatePath("/library");
    revalidatePath(`/read/${id}`);

    return Response.json({
      ok: true,
      tags: result.tags ?? existing.tags,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof ConflictError) {
      // Contention bubbled past both folio's retry loop and the app-layer
      // retryOnConflict + idempotency check. Treat as a transient; client
      // can retry. Logged as warning, not error — this is expected under
      // heavy concurrent edits to the same article, not a 5xx-worthy bug.
      console.warn("[api/articles/PATCH] conflict after retries", { id });
      return Response.json(
        { error: "Conflict — another write landed first; please retry" },
        { status: 409 },
      );
    }
    console.error("[api/articles/PATCH] update failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
