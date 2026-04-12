import { auth } from "@clerk/nextjs/server";
import {
  addHighlight,
  deleteHighlight,
  highlightInputSchema,
  highlightPatchSchema,
  listHighlights,
  updateHighlight,
} from "@/lib/annotations";
import { authedUserId } from "@/lib/auth-types";
import { checkOrigin } from "@/lib/csrf";
import { z } from "zod";

const ARTICLE_ID_RE = /^[a-f0-9]{32}$/;

async function authed(
  req: Request,
  id: string,
  requireOrigin: boolean,
): Promise<
  | { kind: "err"; res: Response }
  | { kind: "ok"; userId: ReturnType<typeof authedUserId> }
> {
  if (requireOrigin) {
    const originError = checkOrigin(req);
    if (originError) return { kind: "err", res: originError };
  }
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return {
      kind: "err",
      res: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  if (!ARTICLE_ID_RE.test(id)) {
    return {
      kind: "err",
      res: Response.json({ error: "Invalid article id" }, { status: 400 }),
    };
  }
  return { kind: "ok", userId: authedUserId(rawUserId) };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authed(req, id, false);
  if (a.kind === "err") return a.res;

  try {
    const highlights = await listHighlights(a.userId, id);
    return Response.json(
      { highlights },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[api/annotations/GET] failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authed(req, id, true);
  if (a.kind === "err") return a.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = highlightInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  if (parsed.data.end <= parsed.data.start) {
    return Response.json(
      { error: "end must be greater than start" },
      { status: 400 },
    );
  }

  try {
    const highlight = await addHighlight(a.userId, id, parsed.data);
    return Response.json({ highlight }, { status: 201 });
  } catch (err) {
    console.error("[api/annotations/POST] failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

const patchBodySchema = z.object({
  id: z.string().min(1).max(64),
  patch: highlightPatchSchema,
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authed(req, id, true);
  if (a.kind === "err") return a.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const updated = await updateHighlight(
      a.userId,
      id,
      parsed.data.id,
      parsed.data.patch,
    );
    if (!updated)
      return Response.json({ error: "Highlight not found" }, { status: 404 });
    return Response.json({ highlight: updated });
  } catch (err) {
    console.error("[api/annotations/PATCH] failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authed(req, id, true);
  if (a.kind === "err") return a.res;

  const url = new URL(req.url);
  const highlightId = url.searchParams.get("hid");
  if (!highlightId)
    return Response.json({ error: "Missing hid" }, { status: 400 });

  try {
    const removed = await deleteHighlight(a.userId, id, highlightId);
    if (!removed)
      return Response.json({ error: "Highlight not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/annotations/DELETE] failed", { id, err });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
