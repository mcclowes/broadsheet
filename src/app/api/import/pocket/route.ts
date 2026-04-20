import { auth } from "@clerk/nextjs/server";
import { authedUserId } from "@/lib/auth-types";
import { pocketImportLimiter } from "@/lib/rate-limit";
import {
  importPocketExport,
  PocketImportError,
} from "@/lib/pocket-import-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ANNOTATIONS_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  // Origin check + auth are enforced by `src/proxy.ts`.
  const { userId: rawUserId } = await auth();
  if (!rawUserId)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = authedUserId(rawUserId);

  const limit = pocketImportLimiter.consume(userId);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many import requests" },
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

  const { csv, annotations } = (body ?? {}) as {
    csv?: unknown;
    annotations?: unknown;
  };

  if (typeof csv !== "string" || csv.length === 0) {
    return Response.json(
      { error: "Expected { csv: string, annotations?: string }" },
      { status: 400 },
    );
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    return Response.json({ error: "CSV too large" }, { status: 413 });
  }
  if (annotations !== undefined && typeof annotations !== "string") {
    return Response.json(
      { error: "`annotations` must be a string if provided" },
      { status: 400 },
    );
  }
  if (
    typeof annotations === "string" &&
    Buffer.byteLength(annotations, "utf8") > MAX_ANNOTATIONS_BYTES
  ) {
    return Response.json({ error: "Annotations too large" }, { status: 413 });
  }

  try {
    const result = await importPocketExport(userId, {
      csv,
      annotations: typeof annotations === "string" ? annotations : undefined,
    });
    return Response.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PocketImportError) {
      console.error("[api/import/pocket] import failed", {
        message: err.message,
        cause: err.cause,
      });
      return Response.json({ error: err.publicMessage }, { status: 422 });
    }
    const e = err as { code?: unknown; name?: unknown; message?: unknown };
    console.error("[api/import/pocket] unexpected failure", {
      errorName: err instanceof Error ? err.constructor.name : typeof err,
      code: e?.code,
      name: e?.name,
      message: e?.message,
    });
    return Response.json({ error: "Import failed" }, { status: 500 });
  }
}
